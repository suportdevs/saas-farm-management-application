import type { Request, Response } from 'express';
import { getFarm } from '../middleware/farm-access.middleware';
import type { PermissionActor } from '../services/role.service';

/** Audit target for events on a farm (they show up in its activity log). */
export const farmEvent = (farmId: string) => ({ targetType: 'farm', targetId: farmId });

/** Role and permission editors act on what they were granted, independent of the current plan. */
export const actorOf = (req: Request, res: Response): PermissionActor => {
  const { role, member, granted } = getFarm(res);
  return { userId: req.auth!.user.id, role, customRoleId: member.customRoleId, permissions: granted };
};
