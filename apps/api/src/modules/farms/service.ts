import { and, asc, count, desc, eq, gt, ne, sql } from 'drizzle-orm';
import {
  cleanOverrides,
  diffFromDefaults,
  FARM_ROLES,
  isOwnerOnly,
  PERMISSIONS,
  resolvePermissions,
  rolePermissions,
  type CreateFarmData,
  type FarmContext,
  type FarmPermissions,
  type FarmProfile,
  type FarmRole,
  type FarmSummary,
  type FarmUsage,
  type Permission,
  type PermissionOverrides,
  type UnitSystem,
} from '@kit/shared';
import { auditLogs } from '../../db/schema';
import { badRequest, conflict, db, forbidden, notFound, randomToken, sha256, users, type User } from '../../core';
import { config } from './config';
import { sendInvitationEmail } from './emails';
import { farmExtensions } from './extensions';
import { farmInvitations, farmMembers, farmRolePermissions, farms, type Farm, type FarmMemberRow } from './schema';

const DAY = 24 * 60 * 60 * 1000;
const INVITE_TTL = 7 * DAY;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Slugs that would collide with app routes. */
export const RESERVED_SLUGS = new Set(['new', 'invitations', 'settings', 'api', 'admin', 'billing', 'onboarding']);

// ─── Serialisation ───────────────────────────────────────────────

export const serializeFarm = (farm: Farm): FarmProfile => ({
  id: farm.id,
  name: farm.name,
  slug: farm.slug,
  type: farm.type,
  description: farm.description,
  country: farm.country,
  region: farm.region,
  city: farm.city,
  address: farm.address,
  postalCode: farm.postalCode,
  timezone: farm.timezone,
  currency: farm.currency,
  locale: farm.locale,
  unitSystem: farm.unitSystem as UnitSystem,
  milkUnit: farm.milkUnit as FarmProfile['milkUnit'],
  weightUnit: farm.weightUnit as FarmProfile['weightUnit'],
  areaUnit: farm.areaUnit as FarmProfile['areaUnit'],
  totalArea: farm.totalArea,
  herdSize: farm.herdSize,
  phone: farm.phone,
  email: farm.email,
  website: farm.website,
  registrationNumber: farm.registrationNumber,
  taxId: farm.taxId,
  fiscalYearStartMonth: farm.fiscalYearStartMonth,
  goals: farm.goals,
  suspendedAt: farm.suspendedAt?.toISOString() ?? null,
  suspendedReason: farm.suspendedReason,
  createdAt: farm.createdAt.toISOString(),
});

// ─── Usage counters ──────────────────────────────────────────────

type Counter = (farmId: string) => Promise<number>;
const usageCounters: Partial<Record<keyof FarmUsage, Counter>> = {};

/**
 * Operation modules report their usage here so plan limits and the billing
 * page stay accurate, e.g. `registerUsageCounter('animals', countActiveAnimals)`.
 */
export function registerUsageCounter(resource: keyof FarmUsage, counter: Counter) {
  usageCounters[resource] = counter;
}

/** Members plus pending invitations — both take a seat. */
export async function seatCount(farmId: string): Promise<number> {
  const [[members], [invites]] = await Promise.all([
    db.select({ value: count() }).from(farmMembers).where(eq(farmMembers.farmId, farmId)),
    db
      .select({ value: count() })
      .from(farmInvitations)
      .where(and(eq(farmInvitations.farmId, farmId), gt(farmInvitations.expiresAt, new Date()))),
  ]);
  return (members?.value ?? 0) + (invites?.value ?? 0);
}

export async function usageOf(farmId: string): Promise<FarmUsage> {
  const [members, animals] = await Promise.all([seatCount(farmId), usageCounters.animals?.(farmId) ?? Promise.resolve(0)]);
  return { members, animals };
}

/** The farm workspace: the core fields plus whatever other modules contribute (e.g. the plan). */
export async function contextOf(farm: Farm, member: Pick<FarmMemberRow, 'role' | 'title' | 'permissionOverrides'>): Promise<FarmContext> {
  const [usage, extra, roleOverrides] = await Promise.all([usageOf(farm.id), farmExtensions.context(farm), roleOverridesOf(farm.id)]);
  const permissions = resolvePermissions(member.role, {
    roleOverrides: roleOverrides[member.role],
    memberOverrides: cleanOverrides(member.permissionOverrides),
  });
  return {
    ...extra,
    farm: serializeFarm(farm),
    membership: { role: member.role, title: member.title, permissions },
    rolePermissions: Object.fromEntries(FARM_ROLES.map((r) => [r, rolePermissions(r, roleOverrides[r])])),
    usage,
  } as FarmContext;
}

// ─── Permissions ─────────────────────────────────────────────────

/** The farm's role overrides, per role ({} for roles on their defaults). */
export async function roleOverridesOf(farmId: string): Promise<Record<FarmRole, PermissionOverrides>> {
  const rows = await db.select().from(farmRolePermissions).where(eq(farmRolePermissions.farmId, farmId));
  const byRole = Object.fromEntries(FARM_ROLES.map((r) => [r, {}])) as Record<FarmRole, PermissionOverrides>;
  for (const row of rows) byRole[row.role] = cleanOverrides(row.overrides);
  return byRole;
}

export async function getFarmPermissions(farmId: string): Promise<FarmPermissions> {
  const [roleOverrides, members] = await Promise.all([
    roleOverridesOf(farmId),
    db
      .select({ userId: farmMembers.userId, role: farmMembers.role, overrides: farmMembers.permissionOverrides })
      .from(farmMembers)
      .where(eq(farmMembers.farmId, farmId)),
  ]);
  return {
    roles: Object.fromEntries(
      FARM_ROLES.map((r) => [r, { permissions: rolePermissions(r, roleOverrides[r]), overrides: roleOverrides[r] }]),
    ) as FarmPermissions['roles'],
    members: members.map((m) => {
      const overrides = m.role === 'owner' ? {} : cleanOverrides(m.overrides);
      return { userId: m.userId, role: m.role, overrides, permissions: resolvePermissions(m.role, { roleOverrides: roleOverrides[m.role], memberOverrides: overrides }) };
    }),
  };
}

export interface PermissionActor {
  userId: string;
  role: FarmRole;
  permissions: Permission[];
}

/**
 * Nobody hands out more than they hold: owners may change any key (except the
 * owner-only ones, which can't be granted at all); others only keys they hold themselves.
 */
function assertMayChange(actor: PermissionActor, changed: Permission[]) {
  const ownerOnly = changed.filter(isOwnerOnly);
  if (ownerOnly.length) throw badRequest(`Only owners can ${ownerOnly.join(', ')}`, 'OWNER_ONLY_PERMISSION');
  if (actor.role === 'owner') return;
  const missing = changed.filter((p) => !actor.permissions.includes(p));
  if (missing.length) {
    throw forbidden(`You can only change permissions you hold yourself (${missing.join(', ')})`, 'PERMISSION_ESCALATION');
  }
}

/** Sets what `role` can do on this farm. Stored as overrides of the role's defaults. */
export async function setRolePermissions(farmId: string, actor: PermissionActor, role: FarmRole, wanted: Permission[]) {
  if (role === 'owner') throw badRequest('Owners always have every permission', 'OWNER_ROLE_LOCKED');
  if (actor.role !== 'owner' && actor.role === role) {
    throw badRequest("You can't change your own role's permissions. Ask an owner.", 'SELF_PERMISSION_CHANGE');
  }
  const current = rolePermissions(role, (await roleOverridesOf(farmId))[role]);
  const target = new Set(wanted);
  const changed = PERMISSIONS.filter((p) => current.includes(p) !== target.has(p));
  if (!changed.length) return { changed };
  assertMayChange(actor, changed);
  const overrides = diffFromDefaults(role, [...target]);
  if (Object.keys(overrides).length === 0) {
    await db.delete(farmRolePermissions).where(and(eq(farmRolePermissions.farmId, farmId), eq(farmRolePermissions.role, role)));
  } else {
    await db
      .insert(farmRolePermissions)
      .values({ farmId, role, overrides, updatedById: actor.userId })
      .onConflictDoUpdate({ target: [farmRolePermissions.farmId, farmRolePermissions.role], set: { overrides, updatedById: actor.userId } });
  }
  return { changed };
}

/** Puts a role back on its built-in defaults. */
export async function resetRolePermissions(farmId: string, actor: PermissionActor, role: FarmRole) {
  return setRolePermissions(farmId, actor, role, rolePermissions(role));
}

/** Replaces a member's allow/deny overrides (keys left out inherit the role). */
export async function setMemberOverrides(farmId: string, actor: PermissionActor, targetUserId: string, overrides: PermissionOverrides) {
  const target = await getMember(farmId, targetUserId);
  if (!target) throw notFound('Member not found');
  if (actor.userId === targetUserId) throw badRequest("You can't change your own permissions. Ask an owner.", 'SELF_PERMISSION_CHANGE');
  if (target.role === 'owner') throw badRequest('Owners always have every permission', 'OWNER_ROLE_LOCKED');
  const previous = cleanOverrides(target.permissionOverrides);
  const next = cleanOverrides(overrides);
  const changed = PERMISSIONS.filter((p) => previous[p] !== next[p]);
  if (!changed.length) return { changed };
  assertMayChange(actor, changed);
  await db
    .update(farmMembers)
    .set({ permissionOverrides: next })
    .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.userId, targetUserId)));
  return { changed };
}

// ─── Farms ───────────────────────────────────────────────────────

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base.length >= 3 && !RESERVED_SLUGS.has(base) ? base : `${base || 'farm'}-farm`;
}

async function slugTaken(slug: string): Promise<boolean> {
  const [row] = await db.select({ id: farms.id }).from(farms).where(eq(farms.slug, slug)).limit(1);
  return Boolean(row);
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 6; i++) {
    const candidate = i === 0 ? base : `${base}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4)}`;
    if (!(await slugTaken(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function listUserFarms(userId: string): Promise<FarmSummary[]> {
  const memberCount = db
    .select({ farmId: farmMembers.farmId, total: count().as('total') })
    .from(farmMembers)
    .groupBy(farmMembers.farmId)
    .as('member_count');
  const rows = await db
    .select({
      farm: farms,
      role: farmMembers.role,
      members: memberCount.total,
      memberOverrides: farmMembers.permissionOverrides,
      roleOverrides: farmRolePermissions.overrides,
    })
    .from(farmMembers)
    .innerJoin(farms, eq(farms.id, farmMembers.farmId))
    .innerJoin(memberCount, eq(memberCount.farmId, farms.id))
    .leftJoin(farmRolePermissions, and(eq(farmRolePermissions.farmId, farmMembers.farmId), eq(farmRolePermissions.role, farmMembers.role)))
    .where(eq(farmMembers.userId, userId))
    .orderBy(sql`${farmMembers.lastAccessedAt} desc nulls last`, asc(farms.name));
  const extra = await farmExtensions.summaries(rows.map((r) => r.farm.id));
  return rows.map(({ farm, role, members, memberOverrides, roleOverrides }) => ({
    ...extra(farm.id),
    id: farm.id,
    name: farm.name,
    slug: farm.slug,
    type: farm.type,
    country: farm.country,
    role,
    memberCount: Number(members),
    suspended: Boolean(farm.suspendedAt),
    permissions: resolvePermissions(role, { roleOverrides: cleanOverrides(roleOverrides), memberOverrides: cleanOverrides(memberOverrides) }),
  })) as FarmSummary[];
}

export async function createFarm(user: User, input: CreateFarmData) {
  const [owned] = await db
    .select({ value: count() })
    .from(farmMembers)
    .where(and(eq(farmMembers.userId, user.id), eq(farmMembers.role, 'owner')));
  if ((owned?.value ?? 0) >= config.FARM_MAX_OWNED) {
    throw forbidden(`You can own up to ${config.FARM_MAX_OWNED} farms. Contact us to raise this limit.`, 'FARM_LIMIT');
  }
  const slug = await uniqueSlug(input.name);
  return db.transaction(async (tx) => {
    const [farm] = await tx
      .insert(farms)
      .values({
        name: input.name,
        slug,
        type: input.type,
        country: input.country,
        region: input.region ?? null,
        city: input.city ?? null,
        timezone: input.timezone,
        currency: input.currency,
        locale: input.locale,
        unitSystem: input.unitSystem,
        milkUnit: input.milkUnit,
        weightUnit: input.weightUnit,
        areaUnit: input.areaUnit,
        totalArea: input.totalArea ?? null,
        herdSize: input.herdSize === null || input.herdSize === undefined ? null : Math.round(input.herdSize),
        goals: input.goals,
        createdById: user.id,
      })
      .returning();
    await tx.insert(farmMembers).values({ farmId: farm!.id, userId: user.id, role: 'owner', lastAccessedAt: new Date() });
    await farmExtensions.created(farm!, tx);
    return farm!;
  });
}

/** Resolves a farm by id or slug together with the user's membership and effective permissions. */
export async function findMembership(key: string, userId: string) {
  const [row] = await db
    .select({ farm: farms, member: farmMembers, roleOverrides: farmRolePermissions.overrides })
    .from(farms)
    .innerJoin(farmMembers, and(eq(farmMembers.farmId, farms.id), eq(farmMembers.userId, userId)))
    .leftJoin(farmRolePermissions, and(eq(farmRolePermissions.farmId, farms.id), eq(farmRolePermissions.role, farmMembers.role)))
    .where(uuidPattern.test(key) ? eq(farms.id, key) : eq(farms.slug, key.toLowerCase()))
    .limit(1);
  if (!row) return undefined;
  const permissions = resolvePermissions(row.member.role, {
    roleOverrides: cleanOverrides(row.roleOverrides),
    memberOverrides: cleanOverrides(row.member.permissionOverrides),
  });
  return { farm: row.farm, member: row.member, permissions };
}

export async function findFarm(id: string) {
  if (!uuidPattern.test(id)) return undefined;
  const [farm] = await db.select().from(farms).where(eq(farms.id, id)).limit(1);
  return farm;
}

/** Remembers the most recently used farm (at most once every 5 minutes). */
export async function touchAccess(member: FarmMemberRow) {
  if (member.lastAccessedAt && Date.now() - member.lastAccessedAt.getTime() < 5 * 60 * 1000) return;
  await db
    .update(farmMembers)
    .set({ lastAccessedAt: new Date() })
    .where(and(eq(farmMembers.farmId, member.farmId), eq(farmMembers.userId, member.userId)));
}

export async function updateFarm(farm: Farm, patch: Partial<typeof farms.$inferInsert>) {
  if (patch.slug && patch.slug !== farm.slug) {
    if (RESERVED_SLUGS.has(patch.slug)) throw badRequest('That address is reserved', 'SLUG_RESERVED');
    if (await slugTaken(patch.slug)) throw conflict('That address is already taken', 'SLUG_TAKEN');
  }
  if (typeof patch.herdSize === 'number') patch.herdSize = Math.round(patch.herdSize);
  const [updated] = await db.update(farms).set(patch).where(eq(farms.id, farm.id)).returning();
  return updated!;
}

/** Deletes a farm and everything in it (other modules clean up first, e.g. cancel billing). */
export async function deleteFarm(farm: Farm) {
  await farmExtensions.deleting(farm);
  await db.delete(farms).where(eq(farms.id, farm.id));
}

/** Suspends (reason) or restores (null) a farm. Suspended farms are read-blocked in requireFarm. */
export async function setSuspended(farmId: string, reason: string | null, suspended = true) {
  const [farm] = await db
    .update(farms)
    .set(suspended ? { suspendedAt: new Date(), suspendedReason: reason } : { suspendedAt: null, suspendedReason: null })
    .where(eq(farms.id, farmId))
    .returning();
  return farm;
}

// ─── Members ─────────────────────────────────────────────────────

export async function listMembers(farmId: string) {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: farmMembers.role,
      title: farmMembers.title,
      joinedAt: farmMembers.createdAt,
      lastActiveAt: farmMembers.lastAccessedAt,
    })
    .from(farmMembers)
    .innerJoin(users, eq(users.id, farmMembers.userId))
    .where(eq(farmMembers.farmId, farmId))
    .orderBy(sql`case ${farmMembers.role} when 'owner' then 0 when 'manager' then 1 else 2 end`, asc(farmMembers.createdAt));
  return rows.map((r) => ({ ...r, joinedAt: r.joinedAt.toISOString(), lastActiveAt: r.lastActiveAt?.toISOString() ?? null }));
}

async function getMember(farmId: string, userId: string) {
  const [m] = await db
    .select()
    .from(farmMembers)
    .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.userId, userId)))
    .limit(1);
  return m;
}

async function ownerCount(farmId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(farmMembers)
    .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.role, 'owner')));
  return row?.value ?? 0;
}

export async function updateMember(
  farmId: string,
  actor: PermissionActor,
  targetUserId: string,
  patch: { role?: FarmRole; title?: string | null },
) {
  const target = await getMember(farmId, targetUserId);
  if (!target) throw notFound('Member not found');
  const self = actor.userId === targetUserId;
  if (!self && !actor.permissions.includes('members.update')) throw forbidden(undefined, 'FARM_PERMISSION_REQUIRED');
  if (patch.role && patch.role !== target.role) {
    if (self) throw badRequest("You can't change your own role. Ask another owner.", 'SELF_ROLE_CHANGE');
    if ((patch.role === 'owner' || target.role === 'owner') && actor.role !== 'owner') {
      throw forbidden('Only owners can grant or remove ownership', 'OWNER_REQUIRED');
    }
  }
  await db
    .update(farmMembers)
    .set({ ...(patch.role ? { role: patch.role } : {}), ...(patch.title !== undefined ? { title: patch.title } : {}) })
    .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.userId, targetUserId)));
  return { previousRole: target.role };
}

/** Removes a member, or leaves when the target is yourself. */
export async function removeMember(farmId: string, actor: PermissionActor, targetUserId: string) {
  const target = await getMember(farmId, targetUserId);
  if (!target) throw notFound('Member not found');
  const self = actor.userId === targetUserId;
  if (!self && !actor.permissions.includes('members.remove')) throw forbidden(undefined, 'FARM_PERMISSION_REQUIRED');
  if (!self && target.role === 'owner' && actor.role !== 'owner') throw forbidden('Only owners can remove owners', 'OWNER_REQUIRED');
  if (target.role === 'owner' && (await ownerCount(farmId)) <= 1) {
    throw badRequest('Make someone else an owner first — every farm needs an owner', 'LAST_OWNER');
  }
  await db.delete(farmMembers).where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.userId, targetUserId)));
}

// ─── Invitations ─────────────────────────────────────────────────

export async function listInvitations(farmId: string) {
  const rows = await db
    .select({ invitation: farmInvitations, inviter: users.name })
    .from(farmInvitations)
    .leftJoin(users, eq(users.id, farmInvitations.invitedById))
    .where(and(eq(farmInvitations.farmId, farmId), gt(farmInvitations.expiresAt, new Date())))
    .orderBy(desc(farmInvitations.createdAt));
  return rows.map(({ invitation: i, inviter }) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    title: i.title,
    invitedBy: inviter,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  }));
}

/** Creates (or refreshes) an invitation and emails the link. */
export async function invite(farm: Farm, inviter: User, input: { email: string; role: FarmRole; title?: string | null }) {
  const [existingMember] = await db
    .select({ id: users.id })
    .from(farmMembers)
    .innerJoin(users, eq(users.id, farmMembers.userId))
    .where(and(eq(farmMembers.farmId, farm.id), eq(users.email, input.email)))
    .limit(1);
  if (existingMember) throw conflict('That person is already on the team', 'ALREADY_MEMBER');

  const [pending] = await db
    .select({ id: farmInvitations.id })
    .from(farmInvitations)
    .where(and(eq(farmInvitations.farmId, farm.id), eq(farmInvitations.email, input.email), gt(farmInvitations.expiresAt, new Date())))
    .limit(1);
  // Re-sending a pending invitation doesn't take another seat.
  if (!pending) await farmExtensions.guardSeat(farm, await seatCount(farm.id));

  const token = randomToken();
  const values = {
    farmId: farm.id,
    email: input.email,
    role: input.role,
    title: input.title ?? null,
    tokenHash: sha256(token),
    invitedById: inviter.id,
    expiresAt: new Date(Date.now() + INVITE_TTL),
  };
  const [invitation] = await db
    .insert(farmInvitations)
    .values(values)
    .onConflictDoUpdate({
      target: [farmInvitations.farmId, farmInvitations.email],
      set: { role: values.role, title: values.title, tokenHash: values.tokenHash, invitedById: inviter.id, expiresAt: values.expiresAt, createdAt: sql`now()` },
    })
    .returning();
  await sendInvitationEmail({ to: input.email, token, farm, inviter, role: input.role });
  return invitation!;
}

export async function revokeInvitation(farmId: string, invitationId: string) {
  if (!uuidPattern.test(invitationId)) throw notFound('Invitation not found');
  const [deleted] = await db
    .delete(farmInvitations)
    .where(and(eq(farmInvitations.farmId, farmId), eq(farmInvitations.id, invitationId)))
    .returning({ email: farmInvitations.email });
  if (!deleted) throw notFound('Invitation not found');
  return deleted;
}

async function findInvitation(token: string) {
  const [row] = await db
    .select({ invitation: farmInvitations, farm: farms })
    .from(farmInvitations)
    .innerJoin(farms, eq(farms.id, farmInvitations.farmId))
    .where(and(eq(farmInvitations.tokenHash, sha256(token)), gt(farmInvitations.expiresAt, new Date())))
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
    farm: { name: row.farm.name, slug: row.farm.slug, type: row.farm.type, country: row.farm.country },
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
  if (row.farm.suspendedAt) throw forbidden('This farm is currently suspended', 'FARM_SUSPENDED');
  await db.transaction(async (tx) => {
    await tx
      .insert(farmMembers)
      .values({ farmId: row.farm.id, userId: user.id, role: row.invitation.role, title: row.invitation.title, lastAccessedAt: new Date() })
      .onConflictDoNothing();
    await tx.delete(farmInvitations).where(eq(farmInvitations.id, row.invitation.id));
  });
  return { farm: row.farm, role: row.invitation.role };
}

// ─── Activity ────────────────────────────────────────────────────

export async function listActivity(farmId: string, opts: { limit: number; offset: number }) {
  const where = and(eq(auditLogs.targetType, 'farm'), eq(auditLogs.targetId, farmId));
  const [rows, [total]] = await Promise.all([
    db
      .select({ log: auditLogs, actor: { id: users.id, name: users.name, email: users.email } })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ value: count() }).from(auditLogs).where(where),
  ]);
  return {
    entries: rows.map(({ log, actor }) => ({
      id: log.id,
      action: log.action,
      actor: actor?.id ? actor : null,
      metadata: log.metadata ?? {},
      createdAt: log.createdAt.toISOString(),
    })),
    total: total?.value ?? 0,
  };
}

// ─── Account lifecycle ───────────────────────────────────────────

/**
 * Before a user is deleted: farms they solely own pass to the longest-standing
 * manager (else any member), or are deleted when nobody is left.
 * Returns the ids of farms that were deleted.
 */
export async function handleUserDeletion(userId: string): Promise<string[]> {
  const deleted: string[] = [];
  const owned = await db
    .select({ farmId: farmMembers.farmId })
    .from(farmMembers)
    .where(and(eq(farmMembers.userId, userId), eq(farmMembers.role, 'owner')));
  for (const { farmId } of owned) {
    const others = await db
      .select()
      .from(farmMembers)
      .where(and(eq(farmMembers.farmId, farmId), ne(farmMembers.userId, userId)))
      .orderBy(asc(farmMembers.createdAt));
    if (others.some((m) => m.role === 'owner')) continue;
    const heir = others.find((m) => m.role === 'manager') ?? others[0];
    if (!heir) {
      deleted.push(farmId);
      continue;
    }
    await db
      .update(farmMembers)
      .set({ role: 'owner' })
      .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.userId, heir.userId)));
  }
  return deleted;
}
