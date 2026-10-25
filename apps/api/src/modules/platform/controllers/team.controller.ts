import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { adminAddMemberSchema, adminMoveFarmSchema, adminTransferOwnershipSchema, adminUpdateMemberSchema } from '@kit/shared';
import { audit } from '../../../core';
import {
  addMemberAsPlatform,
  listInvitations,
  listMembers,
  moveFarmToOrganization,
  platformActor,
  removeMember,
  resendInvitation,
  revokeInvitation,
  transferOwnership,
  updateMember,
  type Farm,
} from '../../farms';
import { findTenant } from '../services/tenant.service';

/**
 * A client's farm team, managed by the platform team (support and manual
 * onboarding). Every change is logged on the farm's activity as an admin action.
 */
const event = (farm: Farm) => ({ targetType: 'farm', targetId: farm.id });
const tenantOf = (req: Request) => findTenant(String(req.params.id));

/** GET /:id/team — members and pending invitations. */
export async function show(req: Request, res: Response) {
  const farm = await tenantOf(req);
  const [members, invitations] = await Promise.all([listMembers(farm.id), listInvitations(farm.id)]);
  res.json({ members, invitations });
}

/** POST /:id/members — an existing account joins now; anyone else is invited. */
export async function addMember(req: Request, res: Response) {
  const farm = await tenantOf(req);
  const { email, role } = req.body as z.output<typeof adminAddMemberSchema>;
  const result = await addMemberAsPlatform(farm, req.auth!.user, email, role);
  await audit(req, { action: result.invited ? 'admin.farm.member_invited' : 'admin.farm.member_added', ...event(farm), metadata: { email, role } });
  res.status(201).json(result);
}

/** PATCH /:id/members/:userId — change a member's role. */
export async function updateMemberRole(req: Request, res: Response) {
  const farm = await tenantOf(req);
  const userId = String(req.params.userId);
  const { role } = req.body as z.output<typeof adminUpdateMemberSchema>;
  const { changed, from, to } = await updateMember(farm.id, platformActor(req.auth!.user), userId, { role });
  if (changed) await audit(req, { action: 'admin.farm.member_role_changed', ...event(farm), metadata: { userId, from, to } });
  res.status(204).end();
}

/** DELETE /:id/members/:userId — the last owner can't be removed. */
export async function removeMemberFromTeam(req: Request, res: Response) {
  const farm = await tenantOf(req);
  const userId = String(req.params.userId);
  await removeMember(farm.id, platformActor(req.auth!.user), userId);
  await audit(req, { action: 'admin.farm.member_removed', ...event(farm), metadata: { userId } });
  res.status(204).end();
}

/** POST /:id/owner — hand the farm to another member (e.g. the client's new manager). */
export async function transferOwner(req: Request, res: Response) {
  const farm = await tenantOf(req);
  const { userId, keepOwners } = req.body as z.output<typeof adminTransferOwnershipSchema>;
  const { previousRole } = await transferOwnership(farm.id, userId, keepOwners);
  await audit(req, { action: 'admin.farm.ownership_transferred', ...event(farm), metadata: { userId, previousRole, keepOwners } });
  res.status(204).end();
}

/** PATCH /:id/organization — the farm now belongs to another client. Pair it with an ownership transfer. */
export async function moveToOrganization(req: Request, res: Response) {
  const farm = await tenantOf(req);
  const { organizationId } = req.body as z.output<typeof adminMoveFarmSchema>;
  const { from, to } = await moveFarmToOrganization(farm, organizationId);
  if (from !== to.id) await audit(req, { action: 'admin.farm.organization_changed', ...event(farm), metadata: { from, to: to.id, name: to.name } });
  res.status(204).end();
}

/** POST /:id/invitations/:invitationId/resend — a fresh link, e.g. when the client lost the email. */
export async function resend(req: Request, res: Response) {
  const farm = await tenantOf(req);
  const { invitation } = await resendInvitation(farm, req.auth!.user, String(req.params.invitationId));
  await audit(req, { action: 'admin.farm.invitation_resent', ...event(farm), metadata: { email: invitation.email } });
  res.status(204).end();
}

/** DELETE /:id/invitations/:invitationId */
export async function revoke(req: Request, res: Response) {
  const farm = await tenantOf(req);
  const { email } = await revokeInvitation(farm.id, String(req.params.invitationId));
  await audit(req, { action: 'admin.farm.invitation_revoked', ...event(farm), metadata: { email } });
  res.status(204).end();
}
