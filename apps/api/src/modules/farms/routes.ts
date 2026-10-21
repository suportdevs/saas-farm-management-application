import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  assignableRoles,
  createFarmSchema,
  deleteFarmSchema,
  inviteMemberSchema,
  invitationTokenSchema,
  memberPermissionsSchema,
  rolePermissionsSchema,
  updateFarmSchema,
  updateMemberSchema,
  farmRoleSchema,
  type CreateFarmData,
  type UpdateFarmData,
} from '@kit/shared';
import { audit, badRequest, forbidden, forbidImpersonation, limiter, notFound, requireAuth, validate } from '../../core';
import { getFarm, requireFarm } from './access';
import * as farms from './service';

export const router = Router();

const createLimiter = limiter({ name: 'farm-create', windowMs: 60 * 60 * 1000, limit: 20 });
const inviteLimiter = limiter({ name: 'farm-invite', windowMs: 60 * 60 * 1000, limit: 60 });

const farmEvent = (farmId: string) => ({ targetType: 'farm', targetId: farmId });

/** Public: the invitation page shows details before the visitor signs in. */
router.post('/invitations/lookup', validate(invitationTokenSchema), async (req, res) => {
  const invitation = await farms.lookupInvitation((req.body as z.infer<typeof invitationTokenSchema>).token);
  if (!invitation) throw badRequest('This invitation is invalid or has expired', 'INVALID_INVITATION');
  res.json({ invitation });
});

router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json({ farms: await farms.listUserFarms(req.auth!.user.id) });
});

router.post('/', createLimiter, validate(createFarmSchema), async (req, res) => {
  const input = req.body as CreateFarmData;
  const farm = await farms.createFarm(req.auth!.user, input);
  await audit(req, { action: 'farm.created', ...farmEvent(farm.id), metadata: { name: farm.name, type: farm.type, country: farm.country } });
  res.status(201).json(await farms.contextOf(farm, { role: 'owner', title: null, permissionOverrides: {} }));
});

// Declared before the /:farm routes.
router.post('/invitations/accept', validate(invitationTokenSchema), async (req, res) => {
  const { token } = req.body as z.infer<typeof invitationTokenSchema>;
  const { farm, role } = await farms.acceptInvitation(token, req.auth!.user);
  await audit(req, { action: 'farm.member_joined', ...farmEvent(farm.id), metadata: { role } });
  res.json({ farm: { id: farm.id, slug: farm.slug, name: farm.name } });
});

// ─── A single farm ───────────────────────────────────────────────

router.get('/:farm', requireFarm(undefined, { allowSuspended: true }), async (_req, res) => {
  const { farm, member } = getFarm(res);
  res.json(await farms.contextOf(farm, member));
});

router.patch('/:farm', requireFarm('farm.update'), validate(updateFarmSchema), async (req, res) => {
  const { farm, member } = getFarm(res);
  const patch = req.body as UpdateFarmData;
  const updated = await farms.updateFarm(farm, patch);
  await audit(req, { action: 'farm.updated', ...farmEvent(farm.id), metadata: { fields: Object.keys(patch) } });
  res.json(await farms.contextOf(updated, member));
});

router.delete('/:farm', requireFarm('farm.delete'), forbidImpersonation, validate(deleteFarmSchema), async (req, res) => {
  const { farm } = getFarm(res);
  const { confirm } = req.body as z.infer<typeof deleteFarmSchema>;
  if (confirm.toLowerCase() !== farm.name.toLowerCase()) {
    throw badRequest('The name you typed does not match the farm name', 'CONFIRMATION_MISMATCH');
  }
  await farms.deleteFarm(farm);
  await audit(req, { action: 'farm.deleted', ...farmEvent(farm.id), metadata: { name: farm.name } });
  res.status(204).end();
});

// ─── Team ────────────────────────────────────────────────────────

router.get('/:farm/members', requireFarm('members.view'), async (_req, res) => {
  res.json({ members: await farms.listMembers(getFarm(res).farm.id) });
});

router.patch('/:farm/members/:userId', requireFarm(), validate(updateMemberSchema), async (req, res) => {
  const { farm, role, permissions } = getFarm(res);
  const patch = req.body as z.output<typeof updateMemberSchema>;
  const targetId = String(req.params.userId);
  const { previousRole } = await farms.updateMember(farm.id, { userId: req.auth!.user.id, role, permissions }, targetId, patch);
  if (patch.role && patch.role !== previousRole) {
    await audit(req, { action: 'farm.member_role_changed', ...farmEvent(farm.id), metadata: { userId: targetId, from: previousRole, to: patch.role } });
  }
  res.status(204).end();
});

/** Removes a member — or leaves the farm when the target is yourself. */
router.delete('/:farm/members/:userId', requireFarm(), async (req, res) => {
  const { farm, role, permissions } = getFarm(res);
  const targetId = String(req.params.userId);
  await farms.removeMember(farm.id, { userId: req.auth!.user.id, role, permissions }, targetId);
  const self = targetId === req.auth!.user.id;
  await audit(req, { action: self ? 'farm.member_left' : 'farm.member_removed', ...farmEvent(farm.id), metadata: { userId: targetId } });
  res.status(204).end();
});

router.get('/:farm/invitations', requireFarm('members.invite'), async (_req, res) => {
  res.json({ invitations: await farms.listInvitations(getFarm(res).farm.id) });
});

router.post('/:farm/invitations', requireFarm('members.invite'), inviteLimiter, validate(inviteMemberSchema), async (req, res) => {
  const { farm, role } = getFarm(res);
  const input = req.body as z.output<typeof inviteMemberSchema>;
  if (!assignableRoles(role).includes(input.role)) throw forbidden('Only owners can invite owners', 'OWNER_REQUIRED');
  if (input.email === req.auth!.user.email) throw badRequest("You're already on the team", 'ALREADY_MEMBER');
  const invitation = await farms.invite(farm, req.auth!.user, input);
  await audit(req, { action: 'farm.member_invited', ...farmEvent(farm.id), metadata: { email: input.email, role: input.role } });
  res.status(201).json({ invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt.toISOString() } });
});

router.delete('/:farm/invitations/:id', requireFarm('members.invite'), async (req, res) => {
  const { farm } = getFarm(res);
  const { email } = await farms.revokeInvitation(farm.id, String(req.params.id));
  await audit(req, { action: 'farm.invitation_revoked', ...farmEvent(farm.id), metadata: { email } });
  res.status(204).end();
});

// ─── Roles & permissions ─────────────────────────────────────────

const roleParam = (req: Request) => {
  const role = farmRoleSchema.safeParse(req.params.role);
  if (!role.success) throw notFound('Role not found');
  return role.data;
};

/** Permission editors act on what they were granted, independent of the current plan. */
const actorOf = (req: Request, res: Response) => {
  const { role, granted } = getFarm(res);
  return { userId: req.auth!.user.id, role, permissions: granted };
};

router.get('/:farm/permissions', requireFarm('roles.view'), async (_req, res) => {
  res.json(await farms.getFarmPermissions(getFarm(res).farm.id));
});

/** Role-based keys: the full set of action keys a role holds on this farm. */
router.put('/:farm/roles/:role/permissions', requireFarm('roles.manage'), validate(rolePermissionsSchema), async (req, res) => {
  const { farm } = getFarm(res);
  const role = roleParam(req);
  const { permissions } = req.body as z.output<typeof rolePermissionsSchema>;
  const { changed } = await farms.setRolePermissions(farm.id, actorOf(req, res), role, permissions);
  if (changed.length) await audit(req, { action: 'farm.role_permissions_changed', ...farmEvent(farm.id), metadata: { role, changed } });
  res.json(await farms.getFarmPermissions(farm.id));
});

router.delete('/:farm/roles/:role/permissions', requireFarm('roles.manage'), async (req, res) => {
  const { farm } = getFarm(res);
  const role = roleParam(req);
  const { changed } = await farms.resetRolePermissions(farm.id, actorOf(req, res), role);
  if (changed.length) await audit(req, { action: 'farm.role_permissions_reset', ...farmEvent(farm.id), metadata: { role, changed } });
  res.json(await farms.getFarmPermissions(farm.id));
});

/** Module overrides: allow / deny single action keys for one member, on top of their role. */
router.put('/:farm/members/:userId/permissions', requireFarm('roles.manage'), validate(memberPermissionsSchema), async (req, res) => {
  const { farm } = getFarm(res);
  const targetId = String(req.params.userId);
  const { overrides } = req.body as z.output<typeof memberPermissionsSchema>;
  const { changed } = await farms.setMemberOverrides(farm.id, actorOf(req, res), targetId, overrides);
  if (changed.length) await audit(req, { action: 'farm.member_permissions_changed', ...farmEvent(farm.id), metadata: { userId: targetId, changed } });
  res.json(await farms.getFarmPermissions(farm.id));
});

// ─── Activity ────────────────────────────────────────────────────

const activityQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

router.get('/:farm/activity', requireFarm('activity.view'), validate(activityQuery, 'query'), async (req, res) => {
  const { page, pageSize } = req.query as unknown as z.infer<typeof activityQuery>;
  const { entries, total } = await farms.listActivity(getFarm(res).farm.id, { limit: pageSize, offset: (page - 1) * pageSize });
  res.json({ entries, pagination: { page, pageSize, total } });
});
