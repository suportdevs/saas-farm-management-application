import { and, asc, count, eq, isNotNull, ne, sql } from 'drizzle-orm';
import {
  cleanOverrides,
  CUSTOM_ROLE_BASE,
  gatePermissions,
  ORG_FARM_ROLE,
  PERMISSIONS,
  resolvePermissions,
  ROLE_INFO,
  rolePermissions,
  type FarmRole,
  type OrgRole,
  type PermissionOverrides,
} from '@kit/shared';
import { badRequest, db, forbidden, isUuid, notDeleted, notFound, revived, softDeleted, users } from '../../../core';
import { farmCustomRoles, farmMembers, farms, organizationMembers, type FarmMemberRow } from '../models';
import type { Tx } from './farm.extensions';
import { gateOf, roleOverridesOf } from './permission.service';
import { assertMayAssign, assertMayChange, findCustomRole, type PermissionActor } from './role.service';

/**
 * The membership a user acts with on a farm: their farm team row, raised by
 * their organization role (org owner → farm owner, org admin → at least manager).
 * Returns null when they have neither. A role given by the organization drops
 * the member's custom role and overrides.
 */
export function effectiveMember(farmId: string, userId: string, member: FarmMemberRow | null, orgRole: OrgRole | null): FarmMemberRow | null {
  const fromOrg = orgRole ? ORG_FARM_ROLE[orgRole] : null;
  if (!fromOrg || member?.role === 'owner') return member;
  if (member && fromOrg === 'manager' && member.role === 'manager' && !member.customRoleId) return member;
  return {
    farmId,
    userId,
    title: member?.title ?? `Organization ${orgRole}`,
    lastAccessedAt: member?.lastAccessedAt ?? null,
    createdAt: member?.createdAt ?? new Date(),
    createdBy: member?.createdBy ?? null,
    updatedAt: member?.updatedAt ?? new Date(),
    updatedBy: member?.updatedBy ?? null,
    deletedAt: null,
    deletedBy: null,
    role: fromOrg,
    customRoleId: null,
    permissionOverrides: {},
  };
}

/** Resolves a farm by id or slug together with the user's membership and effective permissions. */
export async function findMembership(key: string, userId: string) {
  const [row] = await db
    .select({ farm: farms, member: farmMembers, orgRole: organizationMembers.role })
    .from(farms)
    .leftJoin(farmMembers, and(eq(farmMembers.farmId, farms.id), eq(farmMembers.userId, userId), notDeleted(farmMembers)))
    .leftJoin(
      organizationMembers,
      and(eq(organizationMembers.organizationId, farms.organizationId), eq(organizationMembers.userId, userId), notDeleted(organizationMembers)),
    )
    .where(and(isUuid(key) ? eq(farms.id, key) : eq(farms.slug, key.toLowerCase()), notDeleted(farms)))
    .limit(1);
  const member = row && effectiveMember(row.farm.id, userId, row.member, row.orgRole);
  if (!row || !member) return undefined;
  const [roleOverrides, customRole] = await Promise.all([
    roleOverridesOf(row.farm.id),
    member.customRoleId ? findCustomRole(row.farm.id, member.customRoleId) : undefined,
  ]);
  /** What the member's role and overrides grant, before the farm's plan and module switches. */
  const granted = resolvePermissions(member.role, {
    roleOverrides: roleOverrides[member.role],
    memberOverrides: cleanOverrides(member.permissionOverrides),
    customRole: customRole?.permissions,
  });
  const gate = await gateOf(row.farm);
  return { farm: row.farm, member, orgRole: row.orgRole, granted, gate, permissions: gatePermissions(granted, gate) };
}

/**
 * Adds someone to a farm team. A member removed earlier still has their (deleted)
 * row — it is brought back with the new role. Someone already on the team is left as is.
 */
export async function addMember(
  executor: Tx | typeof db,
  values: { farmId: string; userId: string; role: FarmRole; customRoleId?: string | null; title?: string | null; lastAccessedAt?: Date | null },
) {
  await executor
    .insert(farmMembers)
    .values(values)
    .onConflictDoUpdate({
      target: [farmMembers.farmId, farmMembers.userId],
      set: {
        role: values.role,
        customRoleId: values.customRoleId ?? null,
        title: values.title ?? null,
        permissionOverrides: {},
        lastAccessedAt: values.lastAccessedAt ?? null,
        createdAt: new Date(),
        ...revived(),
      },
      setWhere: isNotNull(farmMembers.deletedAt),
    });
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
    .where(and(eq(farmMembers.farmId, farmId), notDeleted(farmMembers)))
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
    .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.userId, userId), notDeleted(farmMembers)))
    .limit(1);
  return m;
}

async function ownerCount(farmId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(farmMembers)
    .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.role, 'owner'), notDeleted(farmMembers)));
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
  await db
    .update(farmMembers)
    .set(softDeleted())
    .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.userId, targetUserId)));
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

/** A deleted user leaves every farm team (their member rows are marked deleted). */
export async function leaveAllFarms(userId: string) {
  await db
    .update(farmMembers)
    .set(softDeleted())
    .where(and(eq(farmMembers.userId, userId), notDeleted(farmMembers)));
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
    .where(and(eq(farmMembers.userId, userId), eq(farmMembers.role, 'owner'), notDeleted(farmMembers)));
  for (const { farmId } of owned) {
    const others = await db
      .select()
      .from(farmMembers)
      .where(and(eq(farmMembers.farmId, farmId), ne(farmMembers.userId, userId), notDeleted(farmMembers)))
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
