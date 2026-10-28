import { and, asc, count, eq, gt, ne, sql } from 'drizzle-orm';
import {
  cleanPermissions,
  isOwnerOnly,
  MAX_CUSTOM_ROLES,
  PERMISSIONS,
  type CustomRoleRef,
  type FarmCustomRole,
  type FarmRole,
  type Permission,
} from '@kit/shared';
import { badRequest, conflict, db, forbidden, isUuid, notDeleted, notFound, softDeleted } from '../../../core';
import { farmCustomRoles, farmInvitations, farmMembers, type FarmCustomRoleRow } from '../models';

export const isRoleId = (v: string) => isUuid(v);

// ─── Escalation rules (shared by role, custom-role and member edits) ──

export interface PermissionActor {
  userId: string;
  role: FarmRole;
  /** The actor's own custom role, if any. */
  customRoleId: string | null;
  /** What the actor was granted (before plan gating). */
  permissions: Permission[];
}

/**
 * Nobody hands out more than they hold: owners may change any key (except the
 * owner-only ones, which can't be granted at all); others only keys they hold themselves.
 */
export function assertMayChange(actor: PermissionActor, changed: readonly Permission[]) {
  const ownerOnly = changed.filter(isOwnerOnly);
  if (ownerOnly.length) throw badRequest(`Only owners can ${ownerOnly.join(', ')}`, 'OWNER_ONLY_PERMISSION');
  if (actor.role === 'owner') return;
  const missing = changed.filter((p) => !actor.permissions.includes(p));
  if (missing.length) {
    throw forbidden(`You can only change permissions you hold yourself (${missing.join(', ')})`, 'PERMISSION_ESCALATION');
  }
}

/** Non-owners may only give someone a role whose keys they hold themselves. */
export function assertMayAssign(actor: PermissionActor, rolePermissions: readonly Permission[]) {
  if (actor.role === 'owner') return;
  const missing = rolePermissions.filter((p) => !actor.permissions.includes(p));
  if (missing.length) {
    throw forbidden(`That role can do more than you can (${missing.join(', ')})`, 'PERMISSION_ESCALATION');
  }
}

// ─── Custom roles ────────────────────────────────────────────────

export const customRoleRef = (row: Pick<FarmCustomRoleRow, 'id' | 'name'> | null | undefined): CustomRoleRef | null =>
  row ? { id: row.id, name: row.name } : null;

/** Every custom role of a farm, with how many members and pending invitations hold it. */
export async function listCustomRoles(farmId: string): Promise<FarmCustomRole[]> {
  const members = db
    .select({ roleId: farmMembers.customRoleId, total: count().as('member_total') })
    .from(farmMembers)
    .where(and(eq(farmMembers.farmId, farmId), notDeleted(farmMembers)))
    .groupBy(farmMembers.customRoleId)
    .as('role_members');
  const invites = db
    .select({ roleId: farmInvitations.customRoleId, total: count().as('invite_total') })
    .from(farmInvitations)
    .where(and(eq(farmInvitations.farmId, farmId), gt(farmInvitations.expiresAt, new Date()), notDeleted(farmInvitations)))
    .groupBy(farmInvitations.customRoleId)
    .as('role_invites');
  const rows = await db
    .select({ role: farmCustomRoles, members: members.total, invites: invites.total })
    .from(farmCustomRoles)
    .leftJoin(members, eq(members.roleId, farmCustomRoles.id))
    .leftJoin(invites, eq(invites.roleId, farmCustomRoles.id))
    .where(and(eq(farmCustomRoles.farmId, farmId), notDeleted(farmCustomRoles)))
    .orderBy(asc(farmCustomRoles.name));
  return rows.map(({ role, members, invites }) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: cleanPermissions(role.permissions),
    memberCount: Number(members ?? 0) + Number(invites ?? 0),
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  }));
}

export async function findCustomRole(farmId: string, id: string) {
  if (!isRoleId(id)) return undefined;
  const [row] = await db
    .select()
    .from(farmCustomRoles)
    .where(and(eq(farmCustomRoles.farmId, farmId), eq(farmCustomRoles.id, id), notDeleted(farmCustomRoles)))
    .limit(1);
  return row;
}

/** Resolves a custom role id from a request, or 404s. */
export async function requireCustomRole(farmId: string, id: string) {
  const row = await findCustomRole(farmId, id);
  if (!row) throw notFound('Role not found', 'ROLE_NOT_FOUND');
  return row;
}

async function assertNameFree(farmId: string, name: string, exceptId?: string) {
  const [taken] = await db
    .select({ id: farmCustomRoles.id })
    .from(farmCustomRoles)
    .where(
      and(
        eq(farmCustomRoles.farmId, farmId),
        sql`lower(${farmCustomRoles.name}) = lower(${name})`,
        exceptId ? ne(farmCustomRoles.id, exceptId) : undefined,
        notDeleted(farmCustomRoles),
      ),
    )
    .limit(1);
  if (taken) throw conflict('A role with that name already exists', 'ROLE_NAME_TAKEN');
}

export async function createCustomRole(
  farmId: string,
  actor: PermissionActor,
  input: { name: string; description?: string | null; permissions: Permission[] },
) {
  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(farmCustomRoles)
    .where(and(eq(farmCustomRoles.farmId, farmId), notDeleted(farmCustomRoles)));
  if (total >= MAX_CUSTOM_ROLES) throw badRequest(`A farm can have up to ${MAX_CUSTOM_ROLES} custom roles`, 'ROLE_LIMIT');
  const permissions = PERMISSIONS.filter((p) => input.permissions.includes(p));
  assertMayChange(actor, permissions);
  await assertNameFree(farmId, input.name);
  const [row] = await db
    .insert(farmCustomRoles)
    .values({ farmId, name: input.name, description: input.description ?? null, permissions, createdById: actor.userId })
    .returning();
  return row!;
}

export async function updateCustomRole(
  farmId: string,
  actor: PermissionActor,
  id: string,
  patch: { name?: string; description?: string | null; permissions?: Permission[] },
) {
  const role = await requireCustomRole(farmId, id);
  let changed: Permission[] = [];
  if (patch.permissions) {
    if (actor.role !== 'owner' && actor.customRoleId === role.id) {
      throw badRequest("You can't change your own role's permissions. Ask an owner.", 'SELF_PERMISSION_CHANGE');
    }
    const current = cleanPermissions(role.permissions);
    const target = new Set(patch.permissions);
    changed = PERMISSIONS.filter((p) => current.includes(p) !== target.has(p));
    assertMayChange(actor, changed);
  }
  if (patch.name && patch.name.toLowerCase() !== role.name.toLowerCase()) await assertNameFree(farmId, patch.name, role.id);
  const [row] = await db
    .update(farmCustomRoles)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.permissions ? { permissions: PERMISSIONS.filter((p) => patch.permissions!.includes(p)) } : {}),
    })
    .where(eq(farmCustomRoles.id, role.id))
    .returning();
  return { role: row!, previous: role, changed };
}

/** Deletes a custom role nobody holds. Members and pending invitations must move to another role first. */
export async function deleteCustomRole(farmId: string, actor: PermissionActor, id: string) {
  const role = await requireCustomRole(farmId, id);
  if (actor.role !== 'owner' && actor.customRoleId === role.id) {
    throw badRequest("You can't delete your own role. Ask an owner.", 'SELF_PERMISSION_CHANGE');
  }
  assertMayChange(actor, cleanPermissions(role.permissions));
  const [[members], [invites]] = await Promise.all([
    db
      .select({ total: count() })
      .from(farmMembers)
      .where(and(eq(farmMembers.customRoleId, role.id), notDeleted(farmMembers))),
    db
      .select({ total: count() })
      .from(farmInvitations)
      .where(and(eq(farmInvitations.customRoleId, role.id), gt(farmInvitations.expiresAt, new Date()), notDeleted(farmInvitations))),
  ]);
  const inUse = (members?.total ?? 0) + (invites?.total ?? 0);
  if (inUse > 0) {
    throw conflict(
      `${inUse} ${inUse === 1 ? 'person has' : 'people have'} this role (members or pending invitations). Give them another role first.`,
      'ROLE_IN_USE',
    );
  }
  // Expired invitations don't block deletion; they are marked deleted with the role.
  const deleted = softDeleted();
  await db.transaction(async (tx) => {
    await tx
      .update(farmInvitations)
      .set(deleted)
      .where(and(eq(farmInvitations.customRoleId, role.id), notDeleted(farmInvitations)));
    await tx.update(farmCustomRoles).set(deleted).where(eq(farmCustomRoles.id, role.id));
  });
  return role;
}
