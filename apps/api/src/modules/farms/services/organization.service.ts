import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import type { OrganizationDetail, OrganizationMember, OrganizationSummary, OrgRole } from '@kit/shared';
import { badRequest, conflict, db, forbidden, isUuid, notFound, users, type User } from '../../../core';
import { farmMembers, farms, organizationMembers, organizations, type Organization } from '../models';
import { farmExtensions, type Tx } from './farm.extensions';

/** The user's role in an organization, or null. */
export async function orgRoleOf(organizationId: string, userId: string): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export async function findOrganization(id: string): Promise<Organization | undefined> {
  if (!isUuid(id)) return undefined;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return org;
}

/** The organizations a user belongs to, with farm and member counts. */
export async function listUserOrganizations(userId: string): Promise<OrganizationSummary[]> {
  const farmCounts = db.select({ organizationId: farms.organizationId, total: count().as('farm_total') }).from(farms).groupBy(farms.organizationId).as('farm_counts');
  const memberCounts = db
    .select({ organizationId: organizationMembers.organizationId, total: count().as('member_total') })
    .from(organizationMembers)
    .groupBy(organizationMembers.organizationId)
    .as('member_counts');
  const rows = await db
    .select({ org: organizations, role: organizationMembers.role, farmCount: farmCounts.total, memberCount: memberCounts.total })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .leftJoin(farmCounts, eq(farmCounts.organizationId, organizations.id))
    .leftJoin(memberCounts, eq(memberCounts.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(asc(organizations.name));
  return rows.map(({ org, role, farmCount, memberCount }) => ({
    id: org.id,
    name: org.name,
    role,
    farmCount: Number(farmCount ?? 0),
    memberCount: Number(memberCount ?? 0),
    createdAt: org.createdAt.toISOString(),
  }));
}

/** Creates an organization with `owner` as its owner (inside `tx` when given). */
export async function createOrganization(owner: User, name: string, tx: Tx | typeof db = db): Promise<Organization> {
  const [org] = await tx.insert(organizations).values({ name, createdById: owner.id }).returning();
  await tx.insert(organizationMembers).values({ organizationId: org!.id, userId: owner.id, role: 'owner' });
  return org!;
}

/** An organization the platform team opens for a client; `owner` joins when they already have an account. */
export async function createClientOrganization(staff: User, name: string, owner: User | null, tx: Tx | typeof db = db): Promise<Organization> {
  const [org] = await tx.insert(organizations).values({ name, createdById: staff.id }).returning();
  if (owner) await tx.insert(organizationMembers).values({ organizationId: org!.id, userId: owner.id, role: 'owner' });
  return org!;
}

/**
 * The organization a new farm joins: the one asked for (the user must be an
 * owner or admin there), else the first one the user owns, else a new one
 * named after the farm.
 */
export async function organizationForNewFarm(user: User, organizationId: string | undefined, farmName: string, tx: Tx): Promise<Organization> {
  if (organizationId) {
    const org = await findOrganization(organizationId);
    const role = org ? await orgRoleOf(org.id, user.id) : null;
    if (!org || !role) throw notFound('Organization not found', 'ORGANIZATION_NOT_FOUND');
    if (role === 'member') throw forbidden('Only organization owners and admins can add farms', 'ORG_ROLE_REQUIRED');
    return org;
  }
  const [owned] = await tx
    .select({ org: organizations })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, user.id), eq(organizationMembers.role, 'owner')))
    .orderBy(asc(organizationMembers.createdAt))
    .limit(1);
  return owned?.org ?? createOrganization(user, farmName, tx);
}

export async function listOrgMembers(organizationId: string): Promise<OrganizationMember[]> {
  const rows = await db
    .select({ userId: users.id, name: users.name, email: users.email, image: users.image, role: organizationMembers.role, joinedAt: organizationMembers.createdAt })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(sql`case ${organizationMembers.role} when 'owner' then 0 when 'admin' then 1 else 2 end`, asc(organizationMembers.createdAt));
  return rows.map((r) => ({ ...r, joinedAt: r.joinedAt.toISOString() }));
}

/** The organization page: its farms (with their plans) and members. */
export async function organizationDetail(org: Organization, role: OrgRole): Promise<OrganizationDetail> {
  const memberCounts = db.select({ farmId: farmMembers.farmId, total: count().as('total') }).from(farmMembers).groupBy(farmMembers.farmId).as('member_counts');
  const [farmRows, members] = await Promise.all([
    db
      .select({ farm: farms, members: memberCounts.total })
      .from(farms)
      .leftJoin(memberCounts, eq(memberCounts.farmId, farms.id))
      .where(eq(farms.organizationId, org.id))
      .orderBy(asc(farms.name)),
    listOrgMembers(org.id),
  ]);
  const extra = await farmExtensions.summaries(farmRows.map((r) => r.farm.id));
  return {
    organization: { id: org.id, name: org.name, createdAt: org.createdAt.toISOString() },
    role,
    farms: farmRows.map(({ farm, members: total }) => {
      const plan = extra(farm.id) as { planId?: string; planName?: string };
      return {
        id: farm.id,
        name: farm.name,
        slug: farm.slug,
        country: farm.country,
        type: farm.type,
        suspended: Boolean(farm.suspendedAt),
        planId: plan.planId ?? 'free',
        planName: plan.planName ?? '',
        memberCount: Number(total ?? 0),
        createdAt: farm.createdAt.toISOString(),
      };
    }),
    members,
  };
}

export async function renameOrganization(org: Organization, name: string) {
  const [updated] = await db.update(organizations).set({ name }).where(eq(organizations.id, org.id)).returning();
  return updated!;
}

/** Deletes an organization that has no farms left. */
export async function deleteOrganization(org: Organization) {
  const [row] = await db.select({ total: count() }).from(farms).where(eq(farms.organizationId, org.id));
  if ((row?.total ?? 0) > 0) throw conflict('Move or delete the organization’s farms first', 'ORGANIZATION_HAS_FARMS');
  await db.delete(organizations).where(eq(organizations.id, org.id));
}

// ─── Members ─────────────────────────────────────────────────────

async function ownerCount(organizationId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.role, 'owner')));
  return row?.total ?? 0;
}

/** Only owners hand out, change or remove the owner role. */
function assertMayAssign(actorRole: OrgRole, ...roles: OrgRole[]) {
  if (actorRole === 'member') throw forbidden('Only organization owners and admins can manage members', 'ORG_ROLE_REQUIRED');
  if (roles.includes('owner') && actorRole !== 'owner') throw forbidden('Only owners can manage owners', 'OWNER_REQUIRED');
}

/** Adds an existing user (by email) to the organization. */
export async function addOrgMember(organizationId: string, actorRole: OrgRole, email: string, role: OrgRole) {
  assertMayAssign(actorRole, role);
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) throw notFound('No account uses that email yet. Ask them to sign up first, or invite them to a farm.', 'USER_NOT_FOUND');
  const [inserted] = await db
    .insert(organizationMembers)
    .values({ organizationId, userId: user.id, role })
    .onConflictDoNothing()
    .returning({ userId: organizationMembers.userId });
  if (!inserted) throw conflict('That person is already in the organization', 'ALREADY_MEMBER');
  return user;
}

export async function updateOrgMember(organizationId: string, actor: { userId: string; role: OrgRole }, targetUserId: string, role: OrgRole) {
  const current = await orgRoleOf(organizationId, targetUserId);
  if (!current) throw notFound('Member not found');
  if (actor.userId === targetUserId) throw badRequest("You can't change your own role", 'SELF_ROLE_CHANGE');
  assertMayAssign(actor.role, current, role);
  if (current === 'owner' && role !== 'owner' && (await ownerCount(organizationId)) <= 1) {
    throw badRequest('Make someone else an owner first — every organization needs an owner', 'LAST_OWNER');
  }
  await db
    .update(organizationMembers)
    .set({ role })
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, targetUserId)));
  return { from: current, to: role };
}

/** Removes a member, or leaves the organization when the target is yourself. */
export async function removeOrgMember(organizationId: string, actor: { userId: string; role: OrgRole }, targetUserId: string) {
  const current = await orgRoleOf(organizationId, targetUserId);
  if (!current) throw notFound('Member not found');
  if (actor.userId !== targetUserId) assertMayAssign(actor.role, current);
  if (current === 'owner' && (await ownerCount(organizationId)) <= 1) {
    throw badRequest('Make someone else an owner first — every organization needs an owner', 'LAST_OWNER');
  }
  await db.delete(organizationMembers).where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, targetUserId)));
}

/** Makes `userId` an owner of the farm's organization when it has none (e.g. a client accepting the owner invitation). */
export async function claimOrganizationIfOwnerless(organizationId: string, userId: string, tx: Tx | typeof db = db) {
  const [owner] = await tx
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.role, 'owner')))
    .limit(1);
  if (owner) return;
  await tx
    .insert(organizationMembers)
    .values({ organizationId, userId, role: 'owner' })
    .onConflictDoUpdate({ target: [organizationMembers.organizationId, organizationMembers.userId], set: { role: 'owner' } });
}

/**
 * Before a user is deleted (after their farms have passed on): organizations
 * they solely own pass to the longest-standing admin, else any member, else an
 * owner of one of its farms. An organization left with nobody and no farms is removed.
 */
export async function handleOrgUserDeletion(userId: string) {
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
    let heir = (others.find((m) => m.role === 'admin') ?? others[0])?.userId;
    if (!heir) {
      const [farmOwner] = await db
        .select({ userId: farmMembers.userId })
        .from(farmMembers)
        .innerJoin(farms, eq(farms.id, farmMembers.farmId))
        .where(and(eq(farms.organizationId, organizationId), eq(farmMembers.role, 'owner'), ne(farmMembers.userId, userId)))
        .orderBy(asc(farmMembers.createdAt))
        .limit(1);
      heir = farmOwner?.userId;
    }
    if (heir) {
      await db
        .insert(organizationMembers)
        .values({ organizationId, userId: heir, role: 'owner' })
        .onConflictDoUpdate({ target: [organizationMembers.organizationId, organizationMembers.userId], set: { role: 'owner' } });
      continue;
    }
    const [farmCount] = await db.select({ total: count() }).from(farms).where(eq(farms.organizationId, organizationId));
    if (!farmCount?.total) await db.delete(organizations).where(eq(organizations.id, organizationId));
  }
}
