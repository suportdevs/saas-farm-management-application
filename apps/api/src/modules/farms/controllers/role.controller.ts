import type { Request, Response } from 'express';
import type { z } from 'zod';
import { FARM_ROLES, farmRoleSchema, ROLE_INFO, type createCustomRoleSchema, type rolePermissionsSchema, type updateCustomRoleSchema } from '@kit/shared';
import { audit, notFound } from '../../../core';
import { getFarm } from '../middleware/farm-access.middleware';
import * as permissions from '../services/permission.service';
import * as roles from '../services/role.service';
import { actorOf, farmEvent } from './helpers';

const systemRoleParam = (req: Request) => {
  const role = farmRoleSchema.safeParse(req.params.role);
  if (!role.success) throw notFound('Role not found');
  return role.data;
};

/** GET /:farm/permissions — everything the editor needs (system + custom roles, members). */
export async function overview(_req: Request, res: Response) {
  res.json(await permissions.getFarmPermissions(getFarm(res).farm.id));
}

/** GET /:farm/roles — system and custom roles. */
export async function list(_req: Request, res: Response) {
  const { roles: system, customRoles } = await permissions.getFarmPermissions(getFarm(res).farm.id);
  res.json({
    system: FARM_ROLES.map((key) => ({ key, ...ROLE_INFO[key], ...system[key] })),
    custom: customRoles,
  });
}

/** POST /:farm/roles — create a custom role. */
export async function create(req: Request, res: Response) {
  const { farm } = getFarm(res);
  const input = req.body as z.output<typeof createCustomRoleSchema>;
  const role = await roles.createCustomRole(farm.id, actorOf(req, res), input);
  await audit(req, {
    action: 'farm.role_created',
    ...farmEvent(farm.id),
    metadata: { roleId: role.id, name: role.name, permissions: role.permissions },
  });
  const created = (await roles.listCustomRoles(farm.id)).find((r) => r.id === role.id);
  res.status(201).json({ role: created });
}

/** GET /:farm/roles/:id — one custom role. */
export async function show(req: Request, res: Response) {
  const { farm } = getFarm(res);
  const id = String(req.params.id);
  if (!roles.isRoleId(id)) throw notFound('Role not found', 'ROLE_NOT_FOUND');
  const role = (await roles.listCustomRoles(farm.id)).find((r) => r.id === id);
  if (!role) throw notFound('Role not found', 'ROLE_NOT_FOUND');
  res.json({ role });
}

/** PATCH /:farm/roles/:id — rename / describe / change keys of a custom role. */
export async function update(req: Request, res: Response) {
  const { farm } = getFarm(res);
  const patch = req.body as z.output<typeof updateCustomRoleSchema>;
  const { role, previous, changed } = await roles.updateCustomRole(farm.id, actorOf(req, res), String(req.params.id), patch);
  await audit(req, {
    action: 'farm.role_updated',
    ...farmEvent(farm.id),
    metadata: { roleId: role.id, name: role.name, ...(previous.name !== role.name ? { from: previous.name } : {}), changed },
  });
  res.json({ role: (await roles.listCustomRoles(farm.id)).find((r) => r.id === role.id) });
}

/** DELETE /:farm/roles/:id — delete an unused custom role. */
export async function remove(req: Request, res: Response) {
  const { farm } = getFarm(res);
  const role = await roles.deleteCustomRole(farm.id, actorOf(req, res), String(req.params.id));
  await audit(req, { action: 'farm.role_deleted', ...farmEvent(farm.id), metadata: { roleId: role.id, name: role.name } });
  res.status(204).end();
}

/** PUT /:farm/roles/:role/permissions — the full set of action keys a system role holds on this farm. */
export async function setSystemPermissions(req: Request, res: Response) {
  const { farm } = getFarm(res);
  const role = systemRoleParam(req);
  const { permissions: wanted } = req.body as z.output<typeof rolePermissionsSchema>;
  const { changed } = await permissions.setRolePermissions(farm.id, actorOf(req, res), role, wanted);
  if (changed.length) await audit(req, { action: 'farm.role_permissions_changed', ...farmEvent(farm.id), metadata: { role, changed } });
  res.json(await permissions.getFarmPermissions(farm.id));
}

/** DELETE /:farm/roles/:role/permissions — back to the role's defaults. */
export async function resetSystemPermissions(req: Request, res: Response) {
  const { farm } = getFarm(res);
  const role = systemRoleParam(req);
  const { changed } = await permissions.resetRolePermissions(farm.id, actorOf(req, res), role);
  if (changed.length) await audit(req, { action: 'farm.role_permissions_reset', ...farmEvent(farm.id), metadata: { role, changed } });
  res.json(await permissions.getFarmPermissions(farm.id));
}
