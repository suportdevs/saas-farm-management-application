import { and, count, eq } from 'drizzle-orm';
import {
  cleanPlatformPermissions,
  isStaffRole,
  PLATFORM_PERMISSIONS,
  STAFF_ROLE_INFO,
  STAFF_ROLE_PERMISSIONS,
  STAFF_ROLES,
  type CreatePlatformRoleInput,
  type PlatformPermission,
  type PlatformRole,
} from '@kit/shared';
import { resolveStaff } from '../../../core/staff';
import { db } from '../../../db/client';
import { platformRoles, users, type PlatformRoleRow, type User } from '../../../db/schema';
import { badRequest, conflict, forbidden, notFound, validationError } from '../../../lib/errors';

/**
 * Platform staff roles. Built-in roles (super_admin, support, billing, analyst)
 * live in code and are read-only; super admins create custom ones.
 */
const MAX_PLATFORM_ROLES = 50;

export interface StaffRoleImportRow {
  key: string;
  name: string;
  description?: string | null;
  permissions: PlatformPermission[];
}

export async function platformRoleExists(key: string) {
  const [row] = await db.select({ id: platformRoles.id }).from(platformRoles).where(eq(platformRoles.key, key)).limit(1);
  return Boolean(row);
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s_-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');

/** Staff holding each role key. Admins without a staff role count as super admins. */
async function userCounts(): Promise<Map<string, number>> {
  const rows = await db
    .select({ key: users.staffRole, total: count() })
    .from(users)
    .where(eq(users.role, 'admin'))
    .groupBy(users.staffRole);
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = r.key ?? 'super_admin';
    map.set(key, (map.get(key) ?? 0) + r.total);
  }
  return map;
}

const serialize = (row: PlatformRoleRow, counts: Map<string, number>): PlatformRole => ({
  key: row.key,
  name: row.name,
  description: row.description,
  permissions: cleanPlatformPermissions(row.permissions),
  system: false,
  userCount: counts.get(row.key) ?? 0,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Built-in and custom staff roles, with how many staff hold each. */
export async function listRoles(): Promise<PlatformRole[]> {
  const [rows, counts] = await Promise.all([db.select().from(platformRoles).orderBy(platformRoles.name), userCounts()]);
  return [
    ...STAFF_ROLES.map((key) => ({
      key,
      name: STAFF_ROLE_INFO[key].label,
      description: STAFF_ROLE_INFO[key].description,
      permissions: [...STAFF_ROLE_PERMISSIONS[key]],
      system: true,
      userCount: counts.get(key) ?? 0,
      createdAt: null,
      updatedAt: null,
    })),
    ...rows.map((r) => serialize(r, counts)),
  ];
}

export async function findRole(key: string) {
  const role = (await listRoles()).find((r) => r.key === key.toLowerCase());
  if (!role) throw notFound('Staff role not found', 'ROLE_NOT_FOUND');
  return role;
}

/** Nobody creates or edits a staff role that can do more than they can. */
async function assertMayGrant(actorUser: User, permissions: readonly PlatformPermission[]) {
  const actor = (await resolveStaff(actorUser))!;
  if (actor.key === 'super_admin') return actor;
  const missing = permissions.filter((p) => !actor.permissions.includes(p));
  if (missing.length) throw forbidden(`You can only grant permissions you hold yourself (${missing.join(', ')})`, 'PERMISSION_ESCALATION');
  return actor;
}

async function findCustom(key: string) {
  key = key.toLowerCase();
  if (isStaffRole(key)) throw badRequest('Built-in staff roles can’t be changed. Create a custom role instead.', 'SYSTEM_ROLE');
  const [row] = await db.select().from(platformRoles).where(eq(platformRoles.key, key)).limit(1);
  if (!row) throw notFound('Staff role not found', 'ROLE_NOT_FOUND');
  return row;
}

export async function createRole(
  actor: User,
  input: Required<Pick<CreatePlatformRoleInput, 'name' | 'permissions'>> & { key?: string; description?: string | null },
) {
  const key = input.key ?? slugify(input.name);
  if (key.length < 2) throw badRequest('Choose a key of at least 2 characters', 'INVALID_KEY');
  if (isStaffRole(key) || (await platformRoleExists(key))) throw conflict('A staff role with that key already exists', 'ROLE_KEY_TAKEN');
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(platformRoles);
  if (total >= MAX_PLATFORM_ROLES) throw badRequest(`Up to ${MAX_PLATFORM_ROLES} custom staff roles`, 'ROLE_LIMIT');
  const permissions = cleanPlatformPermissions(input.permissions);
  await assertMayGrant(actor, permissions);
  const [row] = await db
    .insert(platformRoles)
    .values({ key, name: input.name, description: input.description ?? null, permissions, createdById: actor.id })
    .returning();
  return { row: row!, role: serialize(row!, await userCounts()) };
}

/**
 * CSV import: every row valid or nothing is saved. New keys are created,
 * existing custom keys updated; built-in keys are rejected per row.
 */
export async function importRoles(actorUser: User, rows: StaffRoleImportRow[]) {
  const actor = (await resolveStaff(actorUser))!;
  const existing = new Map((await db.select().from(platformRoles)).map((r) => [r.key, r]));
  const details: Record<string, string[]> = {};
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    if (isStaffRole(row.key)) details[`rows.${i}.key`] = ['Built-in staff roles can’t be imported'];
    else if (seen.has(row.key)) details[`rows.${i}.key`] = ['This key appears more than once in the file'];
    else if (row.key === actor.key) details[`rows.${i}.key`] = ["You can't change your own staff role"];
    seen.add(row.key);
    const missing = actor.key === 'super_admin' ? [] : row.permissions.filter((p) => !actor.permissions.includes(p));
    if (missing.length) details[`rows.${i}.permissions`] = [`You can't grant ${missing.join(', ')}`];
  });
  const created = rows.filter((r) => !existing.has(r.key)).length;
  if (existing.size + created > MAX_PLATFORM_ROLES) details.rows = [`Up to ${MAX_PLATFORM_ROLES} custom staff roles`];
  if (Object.keys(details).length) throw validationError(details);

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const values = { name: row.name, description: row.description ?? null, permissions: cleanPlatformPermissions(row.permissions) };
      if (existing.has(row.key)) await tx.update(platformRoles).set(values).where(eq(platformRoles.key, row.key));
      else await tx.insert(platformRoles).values({ key: row.key, ...values, createdById: actorUser.id });
    }
  });
  return { created, updated: rows.length - created };
}

export async function updateRole(
  actorUser: User,
  key: string,
  patch: { name?: string; description?: string | null; permissions?: PlatformPermission[] },
) {
  const row = await findCustom(key);
  let changed: PlatformPermission[] = [];
  if (patch.permissions) {
    const actor = await assertMayGrant(actorUser, patch.permissions);
    const before = cleanPlatformPermissions(row.permissions);
    changed = PLATFORM_PERMISSIONS.filter((p) => before.includes(p) !== patch.permissions!.includes(p));
    // Removing keys is also limited to keys the actor holds, and nobody edits their own role.
    if (actor.key === row.key) throw badRequest("You can't change your own staff role. Ask a super admin.", 'SELF_ACTION');
    await assertMayGrant(actorUser, changed);
  }
  const [updated] = await db
    .update(platformRoles)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.permissions ? { permissions: cleanPlatformPermissions(patch.permissions) } : {}),
    })
    .where(eq(platformRoles.id, row.id))
    .returning();
  return { row, changed, role: serialize(updated!, await userCounts()) };
}

/** Deletes a custom role nobody holds. */
export async function deleteRole(actor: User, key: string) {
  const row = await findCustom(key);
  await assertMayGrant(actor, cleanPlatformPermissions(row.permissions));
  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.staffRole, row.key)));
  if (total > 0) {
    throw conflict(`${total} staff ${total === 1 ? 'member has' : 'members have'} this role. Give them another role first.`, 'ROLE_IN_USE');
  }
  await db.delete(platformRoles).where(eq(platformRoles.id, row.id));
  return row;
}
