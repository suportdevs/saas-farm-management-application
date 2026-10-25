import { and, eq } from 'drizzle-orm';
import {
  cleanOverrides,
  diffFromDefaults,
  FARM_ROLES,
  PERMISSIONS,
  resolvePermissions,
  rolePermissions,
  type FarmPermissions,
  type FarmRole,
  type ModuleGate,
  type Permission,
  type PermissionOverrides,
} from '@kit/shared';
import { badRequest, db } from '../../../core';
import { farmMembers, farmRolePermissions, type Farm } from '../models';
import { farmExtensions } from './farm.extensions';
import { assertMayChange, listCustomRoles, type PermissionActor } from './role.service';

/** What the farm itself allows: its plan capabilities and its module switches. */
export async function gateOf(farm: Farm): Promise<ModuleGate> {
  const capabilities = await farmExtensions.capabilities([farm.id]);
  return { capabilities: capabilities(farm.id), disabledModules: farm.disabledModules };
}

/** The farm's role overrides, per role ({} for roles on their defaults). */
export async function roleOverridesOf(farmId: string): Promise<Record<FarmRole, PermissionOverrides>> {
  const rows = await db.select().from(farmRolePermissions).where(eq(farmRolePermissions.farmId, farmId));
  const byRole = Object.fromEntries(FARM_ROLES.map((r) => [r, {}])) as Record<FarmRole, PermissionOverrides>;
  for (const row of rows) byRole[row.role] = cleanOverrides(row.overrides);
  return byRole;
}

export async function getFarmPermissions(farmId: string): Promise<FarmPermissions> {
  const [roleOverrides, customRoles, members] = await Promise.all([
    roleOverridesOf(farmId),
    listCustomRoles(farmId),
    db
      .select({ userId: farmMembers.userId, role: farmMembers.role, customRoleId: farmMembers.customRoleId, overrides: farmMembers.permissionOverrides })
      .from(farmMembers)
      .where(eq(farmMembers.farmId, farmId)),
  ]);
  const byId = new Map(customRoles.map((r) => [r.id, r]));
  return {
    roles: Object.fromEntries(
      FARM_ROLES.map((r) => [r, { permissions: rolePermissions(r, roleOverrides[r]), overrides: roleOverrides[r] }]),
    ) as FarmPermissions['roles'],
    customRoles,
    members: members.map((m) => {
      const overrides = m.role === 'owner' ? {} : cleanOverrides(m.overrides);
      const customRole = m.customRoleId ? byId.get(m.customRoleId)?.permissions : undefined;
      return {
        userId: m.userId,
        role: m.role,
        customRoleId: m.customRoleId,
        overrides,
        permissions: resolvePermissions(m.role, { roleOverrides: roleOverrides[m.role], memberOverrides: overrides, customRole }),
      };
    }),
  };
}

/** Sets what `role` can do on this farm. Stored as overrides of the role's defaults. */
export async function setRolePermissions(farmId: string, actor: PermissionActor, role: FarmRole, wanted: Permission[]) {
  if (role === 'owner') throw badRequest('Owners always have every permission', 'OWNER_ROLE_LOCKED');
  // Members with a custom role don't get their base system role's keys, so editing it isn't self-editing.
  if (actor.role !== 'owner' && actor.role === role && !actor.customRoleId) {
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
