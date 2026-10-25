import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { invitationTokenSchema, inviteMemberSchema } from '@kit/shared';
import { audit, badRequest } from '../../../core';
import { getFarm } from '../middleware/farm-access.middleware';
import * as invitations from '../services/invitation.service';
import { actorOf, farmEvent } from './helpers';

/** POST /invitations/lookup — public: the invitation page shows details before the visitor signs in. */
export async function lookup(req: Request, res: Response) {
  const invitation = await invitations.lookupInvitation((req.body as z.infer<typeof invitationTokenSchema>).token);
  if (!invitation) throw badRequest('This invitation is invalid or has expired', 'INVALID_INVITATION');
  res.json({ invitation });
}

/** POST /invitations/accept */
export async function accept(req: Request, res: Response) {
  const { token } = req.body as z.infer<typeof invitationTokenSchema>;
  const { farm, role } = await invitations.acceptInvitation(token, req.auth!.user);
  await audit(req, { action: 'farm.member_joined', ...farmEvent(farm.id), metadata: { role } });
  res.json({ farm: { id: farm.id, slug: farm.slug, name: farm.name } });
}

/** GET /:farm/invitations — pending invitations. */
export async function list(_req: Request, res: Response) {
  res.json({ invitations: await invitations.listInvitations(getFarm(res).farm.id) });
}

/** POST /:farm/invitations */
export async function create(req: Request, res: Response) {
  const { farm } = getFarm(res);
  const input = req.body as z.output<typeof inviteMemberSchema>;
  if (input.email === req.auth!.user.email) throw badRequest("You're already on the team", 'ALREADY_MEMBER');
  const { invitation, roleLabel } = await invitations.invite(farm, req.auth!.user, actorOf(req, res), input);
  await audit(req, { action: 'farm.member_invited', ...farmEvent(farm.id), metadata: { email: input.email, role: invitation.role, roleLabel } });
  res.status(201).json({
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      customRoleId: invitation.customRoleId,
      expiresAt: invitation.expiresAt.toISOString(),
    },
  });
}

/** DELETE /:farm/invitations/:id */
export async function revoke(req: Request, res: Response) {
  const { farm } = getFarm(res);
  const { email } = await invitations.revokeInvitation(farm.id, String(req.params.id));
  await audit(req, { action: 'farm.invitation_revoked', ...farmEvent(farm.id), metadata: { email } });
  res.status(204).end();
}
