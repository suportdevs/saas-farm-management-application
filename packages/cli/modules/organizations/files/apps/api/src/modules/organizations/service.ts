import { and, asc, count, eq, gt, ne, sql } from 'drizzle-orm';
import { badRequest, conflict, db, env, forbidden, notFound, randomToken, renderEmail, sendMail, sha256, users, type User } from '../../core';
import {
  organizationInvitations,
  organizationMembers,
  organizations,
  type Organization,
  type OrgRole,
} from './schema';

const INVITE_TTL = 7 * 24 * 60 * 60 * 1000;
const RANK: Record<OrgRole, number> = { member: 1, admin: 2, owner: 3 };
export const atLeast = (role: OrgRole, min: OrgRole) => RANK[role] >= RANK[min];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Slugs that would collide with routes. */
export const RESERVED_SLUGS = new Set(['invitations', 'new', 'settings', 'api', 'admin']);

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base && !RESERVED_SLUGS.has(base) ? base : `${base || 'org'}-team`;
}

async function slugTaken(slug: string): Promise<boolean> {
  const [row] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
  return Boolean(row);
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? base : `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (!(await slugTaken(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function listUserOrganizations(userId: string) {
  const memberCount = db
    .select({ organizationId: organizationMembers.organizationId, total: count().as('total') })
    .from(organizationMembers)
    .groupBy(organizationMembers.organizationId)
    .as('member_count');
  const rows = await db
    .select({ org: organizations, role: organizationMembers.role, members: memberCount.total })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .innerJoin(memberCount, eq(memberCount.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(asc(organizations.name));
  return rows.map((r) => ({ ...serializeOrg(r.org), role: r.role, memberCount: Number(r.members) }));
}

export const serializeOrg = (org: Organization) => ({
  id: org.id,
  name: org.name,
  slug: org.slug,
  createdAt: org.createdAt.toISOString(),
});

export async function createOrganization(user: User, name: string, slug?: string) {
  if (slug && (await slugTaken(slug))) {
    throw conflict('That URL is already taken', 'SLUG_TAKEN');
  }
  const finalSlug = slug ?? (await uniqueSlug(name));
  return db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({ name, slug: finalSlug }).returning();
    await tx.insert(organizationMembers).values({ organizationId: org!.id, userId: user.id, role: 'owner' });
    return org!;
  });
}

/** Resolves an org by id or slug together with the user's membership. */
export async function findMembership(key: string, userId: string) {
  const [row] = await db
    .select({ org: organizations, role: organizationMembers.role })
    .from(organizations)
    .innerJoin(
      organizationMembers,
      and(eq(organizationMembers.organizationId, organizations.id), eq(organizationMembers.userId, userId)),
    )
    .where(uuidPattern.test(key) ? eq(organizations.id, key) : eq(organizations.slug, key.toLowerCase()))
    .limit(1);
  return row;
}

export async function updateOrganization(org: Organization, patch: { name?: string; slug?: string }) {
  if (patch.slug && patch.slug !== org.slug) {
    if (await slugTaken(patch.slug)) throw conflict('That URL is already taken', 'SLUG_TAKEN');
  }
  const [updated] = await db.update(organizations).set(patch).where(eq(organizations.id, org.id)).returning();
  return updated!;
}

export async function deleteOrganization(orgId: string) {
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

export async function listMembers(orgId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: organizationMembers.role,
      joinedAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, orgId))
    .orderBy(asc(organizationMembers.createdAt));
}

async function getMember(orgId: string, userId: string) {
  const [m] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)))
    .limit(1);
  return m;
}

async function ownerCount(orgId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.role, 'owner')));
  return row?.value ?? 0;
}

/** Changes a member's role. Only owners can grant or revoke ownership; the last owner can't be demoted. */
export async function changeRole(orgId: string, actorRole: OrgRole, targetUserId: string, role: OrgRole) {
  const target = await getMember(orgId, targetUserId);
  if (!target) throw notFound('Member not found');
  if ((role === 'owner' || target.role === 'owner') && actorRole !== 'owner') {
    throw forbidden('Only owners can change ownership', 'OWNER_REQUIRED');
  }
  if (target.role === 'owner' && role !== 'owner' && (await ownerCount(orgId)) <= 1) {
    throw badRequest('An organization needs at least one owner', 'LAST_OWNER');
  }
  await db
    .update(organizationMembers)
    .set({ role })
    .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, targetUserId)));
}

export async function removeMember(orgId: string, actor: { userId: string; role: OrgRole }, targetUserId: string) {
  const target = await getMember(orgId, targetUserId);
  if (!target) throw notFound('Member not found');
  const self = actor.userId === targetUserId;
  if (!self && !atLeast(actor.role, 'admin')) throw forbidden();
  if (!self && target.role === 'owner' && actor.role !== 'owner') throw forbidden('Only owners can remove owners', 'OWNER_REQUIRED');
  if (target.role === 'owner' && (await ownerCount(orgId)) <= 1) {
    throw badRequest('Transfer ownership before leaving — an organization needs an owner', 'LAST_OWNER');
  }
  await db
    .delete(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, targetUserId)));
}

export async function listInvitations(orgId: string) {
  return db
    .select({
      id: organizationInvitations.id,
      email: organizationInvitations.email,
      role: organizationInvitations.role,
      expiresAt: organizationInvitations.expiresAt,
      createdAt: organizationInvitations.createdAt,
    })
    .from(organizationInvitations)
    .where(and(eq(organizationInvitations.organizationId, orgId), gt(organizationInvitations.expiresAt, new Date())))
    .orderBy(asc(organizationInvitations.createdAt));
}

/** Creates (or refreshes) an invitation and emails the link. */
export async function invite(org: Organization, inviter: User, email: string, role: OrgRole) {
  const [existingMember] = await db
    .select({ id: users.id })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.organizationId, org.id), eq(users.email, email)))
    .limit(1);
  if (existingMember) throw conflict('That person is already a member', 'ALREADY_MEMBER');

  const token = randomToken();
  const values = {
    organizationId: org.id,
    email,
    role,
    tokenHash: sha256(token),
    invitedById: inviter.id,
    expiresAt: new Date(Date.now() + INVITE_TTL),
  };
  const [invitation] = await db
    .insert(organizationInvitations)
    .values(values)
    .onConflictDoUpdate({
      target: [organizationInvitations.organizationId, organizationInvitations.email],
      set: { role, tokenHash: values.tokenHash, invitedById: inviter.id, expiresAt: values.expiresAt, createdAt: sql`now()` },
    })
    .returning();

  const url = `${env.WEB_URL}/invite?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    subject: `${inviter.name} invited you to ${org.name} on ${env.APP_NAME}`,
    ...renderEmail({
      heading: `Join ${org.name}`,
      body: [
        `${inviter.name} (${inviter.email}) invited you to join ${org.name} on ${env.APP_NAME} as ${role === 'admin' ? 'an admin' : `a ${role}`}.`,
        'This invitation expires in 7 days.',
      ],
      action: { label: 'Accept invitation', url },
    }),
  });
  return invitation!;
}

export async function revokeInvitation(orgId: string, invitationId: string) {
  const [deleted] = await db
    .delete(organizationInvitations)
    .where(and(eq(organizationInvitations.organizationId, orgId), eq(organizationInvitations.id, invitationId)))
    .returning({ id: organizationInvitations.id });
  if (!deleted) throw notFound('Invitation not found');
}

async function findInvitation(token: string) {
  const [row] = await db
    .select({ invitation: organizationInvitations, org: organizations })
    .from(organizationInvitations)
    .innerJoin(organizations, eq(organizations.id, organizationInvitations.organizationId))
    .where(and(eq(organizationInvitations.tokenHash, sha256(token)), gt(organizationInvitations.expiresAt, new Date())))
    .limit(1);
  return row;
}

/** Public details shown on the invitation page before accepting. */
export async function lookupInvitation(token: string) {
  const row = await findInvitation(token);
  if (!row) return null;
  const inviter = row.invitation.invitedById
    ? await db.query.users.findFirst({ where: eq(users.id, row.invitation.invitedById) })
    : undefined;
  return {
    organization: { name: row.org.name, slug: row.org.slug },
    email: row.invitation.email,
    role: row.invitation.role,
    invitedBy: inviter?.name ?? null,
  };
}

export async function acceptInvitation(token: string, user: User) {
  const row = await findInvitation(token);
  if (!row) throw badRequest('This invitation is invalid or has expired', 'INVALID_INVITATION');
  if (row.invitation.email !== user.email.toLowerCase()) {
    throw forbidden(`This invitation was sent to ${row.invitation.email}. Sign in with that address to accept it.`, 'INVITATION_EMAIL_MISMATCH');
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(organizationMembers)
      .values({ organizationId: row.org.id, userId: user.id, role: row.invitation.role })
      .onConflictDoNothing();
    await tx.delete(organizationInvitations).where(eq(organizationInvitations.id, row.invitation.id));
  });
  return row.org;
}

/**
 * Before a user is deleted: orgs they solely own get a new owner (the
 * longest-standing admin, else member), or are deleted when nobody is left.
 */
export async function handleUserDeletion(userId: string) {
  const owned = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.role, 'owner')));
  for (const { organizationId } of owned) {
    const others = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organizationId), ne(organizationMembers.userId, userId)))
      .orderBy(asc(organizationMembers.createdAt));
    if (others.some((m) => m.role === 'owner')) continue;
    const heir = others.find((m) => m.role === 'admin') ?? others[0];
    if (!heir) {
      await deleteOrganization(organizationId);
      continue;
    }
    await db
      .update(organizationMembers)
      .set({ role: 'owner' })
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, heir.userId)));
  }
}

