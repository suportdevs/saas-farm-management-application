import { Router, type Request } from 'express';
import { and, count, eq } from 'drizzle-orm';
import {
  cleanPlatformPermissions,
  createPlatformRoleSchema,
  isStaffRole,
  PLATFORM_PERMISSIONS,
  STAFF_ROLE_INFO,
  STAFF_ROLE_PERMISSIONS,
  STAFF_ROLES,
  updatePlatformRoleSchema,
  type CreatePlatformRoleInput,
  type PlatformPermission,
  type PlatformRole,
} from '@kit/shared';
import { audit } from '../../core/audit';
import { resolveStaff } from '../../core/staff';
import { db } from '../../db/client';
import { platformRoles, users, type PlatformRoleRow } from '../../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { requirePlatform } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

/**
 * Platform staff roles, mounted at /api/admin/staff-roles:
 *
 *   GET    /       built-in and custom staff roles, with how many staff hold each
 *   POST   /       create a custom staff role
 *   GET    /:key   one role
 *   PATCH  /:key   rename / describe / change the keys of a custom role
 *   DELETE /:key   delete a custom role nobody holds
 *
 * Built-in roles (super_admin, support, billing, analyst) are read-only.
 */
export const staffRolesRouter = Router();

const MAX_PLATFORM_ROLES = 50;

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

async function listRoles(): Promise<PlatformRole[]> {
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

/** Nobody creates or edits a staff role that can do more than they can. */
async function assertMayGrant(req: Request, permissions: readonly PlatformPermission[]) {
  const actor = (await resolveStaff(req.auth!.user))!;
  if (actor.key === 'super_admin') return actor;
  const missing = permissions.filter((p) => !actor.permissions.includes(p));
  if (missing.length) throw forbidden(`You can only grant permissions you hold yourself (${missing.join(', ')})`, 'PERMISSION_ESCALATION');
  return actor;
}

async function loadCustom(req: Request) {
  const key = String(req.params.key).toLowerCase();
  if (isStaffRole(key)) throw badRequest('Built-in staff roles can’t be changed. Create a custom role instead.', 'SYSTEM_ROLE');
  const [row] = await db.select().from(platformRoles).where(eq(platformRoles.key, key)).limit(1);
  if (!row) throw notFound('Staff role not found', 'ROLE_NOT_FOUND');
  return row;
}

staffRolesRouter.use(requirePlatform('platform.staff.manage'));

staffRolesRouter.get('/', async (_req, res) => {
  res.json({ roles: await listRoles(), permissions: PLATFORM_PERMISSIONS });
});

staffRolesRouter.post('/', validate(createPlatformRoleSchema), async (req, res) => {
  const input = req.body as Required<Pick<CreatePlatformRoleInput, 'name' | 'permissions'>> & { key?: string; description?: string | null };
  const key = input.key ?? slugify(input.name);
  if (key.length < 2) throw badRequest('Choose a key of at least 2 characters', 'INVALID_KEY');
  if (isStaffRole(key) || (await platformRoleExists(key))) throw conflict('A staff role with that key already exists', 'ROLE_KEY_TAKEN');
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(platformRoles);
  if (total >= MAX_PLATFORM_ROLES) throw badRequest(`Up to ${MAX_PLATFORM_ROLES} custom staff roles`, 'ROLE_LIMIT');
  const permissions = cleanPlatformPermissions(input.permissions);
  await assertMayGrant(req, permissions);
  const [row] = await db
    .insert(platformRoles)
    .values({ key, name: input.name, description: input.description ?? null, permissions, createdById: req.auth!.user.id })
    .returning();
  await audit(req, { action: 'admin.staff_role.created', targetType: 'staff_role', targetId: row!.id, metadata: { key, name: row!.name, permissions } });
  res.status(201).json({ role: serialize(row!, await userCounts()) });
});

staffRolesRouter.get('/:key', async (req, res) => {
  const key = String(req.params.key).toLowerCase();
  const role = (await listRoles()).find((r) => r.key === key);
  if (!role) throw notFound('Staff role not found', 'ROLE_NOT_FOUND');
  res.json({ role });
});

staffRolesRouter.patch('/:key', validate(updatePlatformRoleSchema), async (req, res) => {
  const row = await loadCustom(req);
  const patch = req.body as { name?: string; description?: string | null; permissions?: PlatformPermission[] };
  let changed: PlatformPermission[] = [];
  if (patch.permissions) {
    const actor = await assertMayGrant(req, patch.permissions);
    const before = cleanPlatformPermissions(row.permissions);
    changed = PLATFORM_PERMISSIONS.filter((p) => before.includes(p) !== patch.permissions!.includes(p));
    // Removing keys is also limited to keys the actor holds, and nobody edits their own role.
    if (actor.key === row.key) throw badRequest("You can't change your own staff role. Ask a super admin.", 'SELF_ACTION');
    await assertMayGrant(req, changed);
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
  await audit(req, { action: 'admin.staff_role.updated', targetType: 'staff_role', targetId: row.id, metadata: { key: row.key, ...patch, changed } });
  res.json({ role: serialize(updated!, await userCounts()) });
});

staffRolesRouter.delete('/:key', async (req, res) => {
  const row = await loadCustom(req);
  await assertMayGrant(req, cleanPlatformPermissions(row.permissions));
  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.staffRole, row.key)));
  if (total > 0) {
    throw conflict(`${total} staff ${total === 1 ? 'member has' : 'members have'} this role. Give them another role first.`, 'ROLE_IN_USE');
  }
  await db.delete(platformRoles).where(eq(platformRoles.id, row.id));
  await audit(req, { action: 'admin.staff_role.deleted', targetType: 'staff_role', targetId: row.id, metadata: { key: row.key, name: row.name } });
  res.status(204).end();
});
