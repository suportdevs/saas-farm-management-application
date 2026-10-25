import { Router } from 'express';
import {
  createCustomRoleSchema,
  createFarmSchema,
  deleteFarmSchema,
  invitationTokenSchema,
  inviteMemberSchema,
  memberPermissionsSchema,
  rolePermissionsSchema,
  updateCustomRoleSchema,
  updateFarmSchema,
  updateMemberSchema,
} from '@kit/shared';
import { forbidImpersonation, limiter, requireAuth, validate } from '../../../core';
import * as activity from '../controllers/activity.controller';
import * as farms from '../controllers/farm.controller';
import * as invitations from '../controllers/invitation.controller';
import * as members from '../controllers/member.controller';
import * as roles from '../controllers/role.controller';
import { requireFarm } from '../middleware/farm-access.middleware';
import { activityQuery } from '../validators/activity.validator';

/** Mounted at /api/farms. */
export const farmRouter = Router();

const createLimiter = limiter({ name: 'farm-create', windowMs: 60 * 60 * 1000, limit: 20 });
const inviteLimiter = limiter({ name: 'farm-invite', windowMs: 60 * 60 * 1000, limit: 60 });

// Public: the invitation page shows details before the visitor signs in.
farmRouter.post('/invitations/lookup', validate(invitationTokenSchema), invitations.lookup);

farmRouter.use(requireAuth);

farmRouter.get('/', farms.list);
farmRouter.post('/', createLimiter, validate(createFarmSchema), farms.create);
// Declared before the /:farm routes.
farmRouter.post('/invitations/accept', validate(invitationTokenSchema), invitations.accept);

// ─── A single farm ───────────────────────────────────────────────

farmRouter.get('/:farm', requireFarm(undefined, { allowSuspended: true }), farms.show);
farmRouter.patch('/:farm', requireFarm('farm.update'), validate(updateFarmSchema), farms.update);
farmRouter.delete('/:farm', requireFarm('farm.delete'), forbidImpersonation, validate(deleteFarmSchema), farms.remove);

// ─── Team ────────────────────────────────────────────────────────

farmRouter.get('/:farm/members', requireFarm('members.view'), members.list);
// Permission checks depend on the target (yourself or someone else) and happen in the service.
farmRouter.patch('/:farm/members/:userId', requireFarm(), validate(updateMemberSchema), members.update);
farmRouter.delete('/:farm/members/:userId', requireFarm(), members.remove);

farmRouter.get('/:farm/invitations', requireFarm('members.invite'), invitations.list);
farmRouter.post('/:farm/invitations', requireFarm('members.invite'), inviteLimiter, validate(inviteMemberSchema), invitations.create);
farmRouter.delete('/:farm/invitations/:id', requireFarm('members.invite'), invitations.revoke);

// ─── Roles & permissions ─────────────────────────────────────────

farmRouter.get('/:farm/permissions', requireFarm('roles.view'), roles.overview);
farmRouter.get('/:farm/roles', requireFarm('roles.view'), roles.list);
farmRouter.post('/:farm/roles', requireFarm('roles.manage'), validate(createCustomRoleSchema), roles.create);
farmRouter.get('/:farm/roles/:id', requireFarm('roles.view'), roles.show);
farmRouter.patch('/:farm/roles/:id', requireFarm('roles.manage'), validate(updateCustomRoleSchema), roles.update);
farmRouter.delete('/:farm/roles/:id', requireFarm('roles.manage'), roles.remove);
farmRouter.put('/:farm/roles/:role/permissions', requireFarm('roles.manage'), validate(rolePermissionsSchema), roles.setSystemPermissions);
farmRouter.delete('/:farm/roles/:role/permissions', requireFarm('roles.manage'), roles.resetSystemPermissions);
farmRouter.put('/:farm/members/:userId/permissions', requireFarm('roles.manage'), validate(memberPermissionsSchema), members.setPermissions);

// ─── Activity ────────────────────────────────────────────────────

farmRouter.get('/:farm/activity', requireFarm('activity.view'), validate(activityQuery, 'query'), activity.list);
