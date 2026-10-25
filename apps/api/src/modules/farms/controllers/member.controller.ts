import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { memberPermissionsSchema, updateMemberSchema } from '@kit/shared';
import { audit } from '../../../core';
import { getFarm } from '../middleware/farm-access.middleware';
import * as members from '../services/member.service';
import { getFarmPermissions } from '../services/permission.service';
import { actorOf, farmEvent } from './helpers';

/** GET /:farm/members */
export async function list(_req: Request, res: Response) {
  res.json({ members: await members.listMembers(getFarm(res).farm.id) });
}

/** PATCH /:farm/members/:userId — role, custom role or title. */
export async function update(req: Request, res: Response) {
  const { farm } = getFarm(res);
  const patch = req.body as z.output<typeof updateMemberSchema>;
  const targetId = String(req.params.userId);
  const { changed, from, to } = await members.updateMember(farm.id, actorOf(req, res), targetId, patch);
  if (changed && from !== to) {
    await audit(req, { action: 'farm.member_role_changed', ...farmEvent(farm.id), metadata: { userId: targetId, from, to } });
  }
  res.status(204).end();
}

/** DELETE /:farm/members/:userId — removes a member, or leaves the farm when the target is yourself. */
export async function remove(req: Request, res: Response) {
  const { farm } = getFarm(res);
  const targetId = String(req.params.userId);
  await members.removeMember(farm.id, actorOf(req, res), targetId);
  const self = targetId === req.auth!.user.id;
  await audit(req, { action: self ? 'farm.member_left' : 'farm.member_removed', ...farmEvent(farm.id), metadata: { userId: targetId } });
  res.status(204).end();
}

/** PUT /:farm/members/:userId/permissions — allow / deny single action keys on top of the member's role. */
export async function setPermissions(req: Request, res: Response) {
  const { farm } = getFarm(res);
  const targetId = String(req.params.userId);
  const { overrides } = req.body as z.output<typeof memberPermissionsSchema>;
  const { changed } = await members.setMemberOverrides(farm.id, actorOf(req, res), targetId, overrides);
  if (changed.length) await audit(req, { action: 'farm.member_permissions_changed', ...farmEvent(farm.id), metadata: { userId: targetId, changed } });
  res.json(await getFarmPermissions(farm.id));
}
