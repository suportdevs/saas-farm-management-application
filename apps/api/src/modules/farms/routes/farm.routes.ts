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
export const router = Router();

const createLimiter = limiter({ name: 'farm-create', windowMs: 60 * 60 * 1000, limit: 20 });
const inviteLimiter = limiter({ name: 'farm-invite', windowMs: 60 * 60 * 1000, limit: 60 });

// Public: the invitation page shows details before the visitor signs in.
router.post('/invitations/lookup', validate(invitationTokenSchema), invitations.lookup);

router.use(requireAuth);

router.get('/', farms.list);
router.post('/', createLimiter, validate(createFarmSchema), farms.create);
// Declared before the /:farm routes.
router.post('/invitations/accept', validate(invitationTokenSchema), invitations.accept);

// ─── A single farm ───────────────────────────────────────────────

router.get('/:farm', requireFarm(undefined, { allowSuspended: true }), farms.show);
router.patch('/:farm', requireFarm('farm.update'), validate(updateFarmSchema), farms.update);
router.delete('/:farm', requireFarm('farm.delete'), forbidImpersonation, validate(deleteFarmSchema), farms.remove);

// ─── Team ────────────────────────────────────────────────────────

router.get('/:farm/members', requireFarm('members.view'), members.list);
// Permission checks depend on the target (yourself or someone else) and happen in the service.
router.patch('/:farm/members/:userId', requireFarm(), validate(updateMemberSchema), members.update);
router.delete('/:farm/members/:userId', requireFarm(), members.remove);

router.get('/:farm/invitations', requireFarm('members.invite'), invitations.list);
router.post('/:farm/invitations', requireFarm('members.invite'), inviteLimiter, validate(inviteMemberSchema), invitations.create);
router.delete('/:farm/invitations/:id', requireFarm('members.invite'), invitations.revoke);

// ─── Roles & permissions ─────────────────────────────────────────

router.get('/:farm/permissions', requireFarm('roles.view'), roles.overview);
router.get('/:farm/roles', requireFarm('roles.view'), roles.list);
router.post('/:farm/roles', requireFarm('roles.manage'), validate(createCustomRoleSchema), roles.create);
router.get('/:farm/roles/:id', requireFarm('roles.view'), roles.show);
router.patch('/:farm/roles/:id', requireFarm('roles.manage'), validate(updateCustomRoleSchema), roles.update);
router.delete('/:farm/roles/:id', requireFarm('roles.manage'), roles.remove);
router.put('/:farm/roles/:role/permissions', requireFarm('roles.manage'), validate(rolePermissionsSchema), roles.setSystemPermissions);
router.delete('/:farm/roles/:role/permissions', requireFarm('roles.manage'), roles.resetSystemPermissions);
router.put('/:farm/members/:userId/permissions', requireFarm('roles.manage'), validate(memberPermissionsSchema), members.setPermissions);

// ─── Activity ────────────────────────────────────────────────────

router.get('/:farm/activity', requireFarm('activity.view'), validate(activityQuery, 'query'), activity.list);
