import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import {
  cleanOverrides,
  CUSTOM_ROLE_BASE,
  gatePermissions,
  PERMISSIONS,
  resolvePermissions,
  ROLE_INFO,
  rolePermissions,
  type FarmRole,
  type PermissionOverrides,
} from '@kit/shared';
import { badRequest, db, forbidden, notFound, users } from '../../../core';
import { farmCustomRoles, farmMembers, farmRolePermissions, farms, type FarmMemberRow } from '../models';
import { gateOf, roleOverridesOf } from './permission.service';
import { assertMayAssign, assertMayChange, findCustomRole, type PermissionActor } from './role.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolves a farm by id or slug together with the user's membership and effective permissions. */
export async function findMembership(key: string, userId: string) {
  const [row] = await db
    .select({ farm: farms, member: farmMembers, roleOverrides: farmRolePermissions.overrides, customRole: farmCustomRoles.permissions })
    .from(farms)
    .innerJoin(farmMembers, and(eq(farmMembers.farmId, farms.id), eq(farmMembers.userId, userId)))
    .leftJoin(farmRolePermissions, and(eq(farmRolePermissions.farmId, farms.id), eq(farmRolePermissions.role, farmMembers.role)))
    .leftJoin(farmCustomRoles, eq(farmCustomRoles.id, farmMembers.customRoleId))
    .where(uuidPattern.test(key) ? eq(farms.id, key) : eq(farms.slug, key.toLowerCase()))
    .limit(1);
  if (!row) return undefined;
  /** What the member's role and overrides grant, before the farm's plan and module switches. */
  const granted = resolvePermissions(row.member.role, {
    roleOverrides: cleanOverrides(row.roleOverrides),
    memberOverrides: cleanOverrides(row.member.permissionOverrides),
    customRole: row.customRole,
  });
  const gate = await gateOf(row.farm);
  return { farm: row.farm, member: row.member, granted, gate, permissions: gatePermissions(granted, gate) };
}

/** Remembers the most recently used farm (at most once every 5 minutes). */
export async function touchAccess(member: FarmMemberRow) {
  if (member.lastAccessedAt && Date.now() - member.lastAccessedAt.getTime() < 5 * 60 * 1000) return;
  await db
    .update(farmMembers)
    .set({ lastAccessedAt: new Date() })
    .where(and(eq(farmMembers.farmId, member.farmId), eq(farmMembers.userId, member.userId)));
}

export async function listMembers(farmId: string) {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: farmMembers.role,
      customRoleId: farmCustomRoles.id,
      customRoleName: farmCustomRoles.name,
      title: farmMembers.title,
      joinedAt: farmMembers.createdAt,
      lastActiveAt: farmMembers.lastAccessedAt,
    })
    .from(farmMembers)
    .innerJoin(users, eq(users.id, farmMembers.userId))
    .leftJoin(farmCustomRoles, eq(farmCustomRoles.id, farmMembers.customRoleId))
    .where(eq(farmMembers.farmId, farmId))
    .orderBy(sql`case ${farmMembers.role} when 'owner' then 0 when 'manager' then 1 else 2 end`, asc(farmMembers.createdAt));
  return rows.map(({ customRoleId, customRoleName, ...r }) => ({
    ...r,
    customRole: customRoleId ? { id: customRoleId, name: customRoleName! } : null,
    joinedAt: r.joinedAt.toISOString(),
    lastActiveAt: r.lastActiveAt?.toISOString() ?? null,
  }));
}

/** A role to give someone: a system role, or one of the farm's custom roles. */
export interface RoleAssignment {
  role?: FarmRole;
  customRoleId?: string | null;
}

/**
 * Resolves what a member or invitee will hold, and checks the actor may hand it
 * out: ownership only from owners, and nobody gives a role that can do more than they can.
 */
export async function resolveAssignment(farmId: string, actor: PermissionActor, assignment: RoleAssignment) {
  if (assignment.customRoleId) {
    const custom = await findCustomRole(farmId, assignment.customRoleId);
    if (!custom) throw notFound('Role not found', 'ROLE_NOT_FOUND');
    const permissions = resolvePermissions(CUSTOM_ROLE_BASE, { customRole: custom.permissions });
    assertMayAssign(actor, permissions);
    return { role: CUSTOM_ROLE_BASE, customRoleId: custom.id, customRole: custom, label: custom.name };
  }
  const role = assignment.role ?? 'worker';
  if (role === 'owner' && actor.role !== 'owner') throw forbidden('Only owners can grant ownership', 'OWNER_REQUIRED');
  assertMayAssign(actor, rolePermissions(role, (await roleOverridesOf(farmId))[role]));
  return { role, customRoleId: null, customRole: null, label: ROLE_INFO[role].label };
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
  patch: { role?: FarmRole; customRoleId?: string; title?: string | null },
) {
  const target = await getMember(farmId, targetUserId);
  if (!target) throw notFound('Member not found');
  const self = actor.userId === targetUserId;
  if (!self && !actor.permissions.includes('members.update')) throw forbidden(undefined, 'FARM_PERMISSION_REQUIRED');
  if (patch.role && patch.customRoleId) throw badRequest('Choose a system role or a custom role, not both', 'ROLE_CONFLICT');

  const changesRole =
    (patch.customRoleId !== undefined && patch.customRoleId !== target.customRoleId) ||
    (patch.role !== undefined && (patch.role !== target.role || target.customRoleId !== null));
  let next: Awaited<ReturnType<typeof resolveAssignment>> | null = null;
  if (changesRole) {
    if (self) throw badRequest("You can't change your own role. Ask another owner.", 'SELF_ROLE_CHANGE');
    if (target.role === 'owner' && actor.role !== 'owner') throw forbidden('Only owners can grant or remove ownership', 'OWNER_REQUIRED');
    next = await resolveAssignment(farmId, actor, patch);
  }
  await db
    .update(farmMembers)
    .set({
      ...(next ? { role: next.role, customRoleId: next.customRoleId } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
    })
    .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.userId, targetUserId)));
  const previousCustom = target.customRoleId ? await findCustomRole(farmId, target.customRoleId) : undefined;
  return {
    changed: Boolean(next),
    from: previousCustom?.name ?? target.role,
    to: next?.customRole?.name ?? next?.role ?? target.role,
  };
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
      .set({ role: 'owner', customRoleId: null })
      .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.userId, heir.userId)));
  }
  return deleted;
}
