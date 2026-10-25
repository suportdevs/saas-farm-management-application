import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { CreateFarmData, deleteFarmSchema, UpdateFarmData } from '@kit/shared';
import { audit, badRequest } from '../../../core';
import { getFarm } from '../middleware/farm-access.middleware';
import * as farms from '../services/farm.service';
import { farmEvent } from './helpers';

/** GET / — farms the signed-in user belongs to. */
export async function list(req: Request, res: Response) {
  res.json({ farms: await farms.listUserFarms(req.auth!.user.id) });
}

/** POST / */
export async function create(req: Request, res: Response) {
  const input = req.body as CreateFarmData;
  const farm = await farms.createFarm(req.auth!.user, input);
  await audit(req, { action: 'farm.created', ...farmEvent(farm.id), metadata: { name: farm.name, type: farm.type, country: farm.country } });
  res.status(201).json(await farms.contextOf(farm, { role: 'owner', title: null, permissionOverrides: {}, customRoleId: null }));
}

/** GET /:farm — the farm workspace context. */
export async function show(_req: Request, res: Response) {
  const { farm, member } = getFarm(res);
  res.json(await farms.contextOf(farm, member));
}

/** PATCH /:farm */
export async function update(req: Request, res: Response) {
  const { farm, member } = getFarm(res);
  const patch = req.body as UpdateFarmData;
  const updated = await farms.updateFarm(farm, patch);
  await audit(req, { action: 'farm.updated', ...farmEvent(farm.id), metadata: { fields: Object.keys(patch) } });
  res.json(await farms.contextOf(updated, member));
}

/** DELETE /:farm — the user retypes the farm name to confirm. */
export async function remove(req: Request, res: Response) {
  const { farm } = getFarm(res);
  const { confirm } = req.body as z.infer<typeof deleteFarmSchema>;
  if (confirm.toLowerCase() !== farm.name.toLowerCase()) {
    throw badRequest('The name you typed does not match the farm name', 'CONFIRMATION_MISMATCH');
  }
  await farms.deleteFarm(farm);
  await audit(req, { action: 'farm.deleted', ...farmEvent(farm.id), metadata: { name: farm.name } });
  res.status(204).end();
}
