import type { Request, Response } from 'express';
import { PLATFORM_PERMISSIONS } from '@kit/shared';
import { audit } from '../../../core/audit';
import * as staffRoles from '../services/staff-role.service';

/** GET / — built-in and custom staff roles, with how many staff hold each. */
export async function list(_req: Request, res: Response) {
  res.json({ roles: await staffRoles.listRoles(), permissions: PLATFORM_PERMISSIONS });
}

/** POST / */
export async function create(req: Request, res: Response) {
  const { row, role } = await staffRoles.createRole(req.auth!.user, req.body);
  await audit(req, {
    action: 'admin.staff_role.created',
    targetType: 'staff_role',
    targetId: row.id,
    metadata: { key: row.key, name: row.name, permissions: role.permissions },
  });
  res.status(201).json({ role });
}

/** POST /import — CSV rows, all or nothing. */
export async function importRoles(req: Request, res: Response) {
  const { rows } = req.body as { rows: staffRoles.StaffRoleImportRow[] };
  const { created, updated } = await staffRoles.importRoles(req.auth!.user, rows);
  await audit(req, { action: 'admin.staff_role.imported', targetType: 'staff_role', metadata: { created, updated, keys: rows.map((r) => r.key) } });
  res.status(201).json({ created, updated });
}

/** GET /:key */
export async function show(req: Request, res: Response) {
  res.json({ role: await staffRoles.findRole(String(req.params.key)) });
}

/** PATCH /:key — rename / describe / change the keys of a custom role. */
export async function update(req: Request, res: Response) {
  const patch = req.body as Parameters<typeof staffRoles.updateRole>[2];
  const { row, changed, role } = await staffRoles.updateRole(req.auth!.user, String(req.params.key), patch);
  await audit(req, { action: 'admin.staff_role.updated', targetType: 'staff_role', targetId: row.id, metadata: { key: row.key, ...patch, changed } });
  res.json({ role });
}

/** DELETE /:key — a custom role nobody holds. */
export async function remove(req: Request, res: Response) {
  const row = await staffRoles.deleteRole(req.auth!.user, String(req.params.key));
  await audit(req, { action: 'admin.staff_role.deleted', targetType: 'staff_role', targetId: row.id, metadata: { key: row.key, name: row.name } });
  res.status(204).end();
}
