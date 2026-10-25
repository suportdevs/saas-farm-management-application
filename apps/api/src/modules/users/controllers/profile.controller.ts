import type { Request, Response } from 'express';
import type { ChangeEmailInput, ChangePasswordInput, DeleteAccountInput, UpdateProfileInput } from '@kit/shared';
import { audit, listAuditLogs, serializeAuditLog } from '../../../core/audit';
import { clearSessionCookie } from '../../../core/session';
import { serializeUser } from '../../../core/user';
import { requestEmailChange } from '../../auth/services/auth.service';
import * as users from '../services/user.service';
import type { ActivityQuery } from '../validators/activity.validator';

/** PATCH /me */
export async function update(req: Request, res: Response) {
  const { name } = req.body as UpdateProfileInput;
  const user = await users.updateProfile(req.auth!.user.id, { name });
  await audit(req, { action: 'user.profile_updated', targetType: 'user', targetId: user.id });
  res.json({ user: await serializeUser(user) });
}

/** POST /me/password */
export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;
  const { user, session } = req.auth!;
  await users.changePassword(user, session.id, currentPassword, newPassword);
  await audit(req, { action: user.passwordHash ? 'user.password_changed' : 'user.password_set', targetType: 'user', targetId: user.id });
  res.json({ ok: true });
}

/** POST /me/email — sends a confirmation link to the new address; the change applies once it's clicked. */
export async function changeEmail(req: Request, res: Response) {
  const { newEmail, password } = req.body as ChangeEmailInput;
  const { user } = req.auth!;
  await users.assertPassword(user, password);
  await requestEmailChange(user, newEmail);
  await audit(req, { action: 'user.email_change_requested', targetType: 'user', targetId: user.id, metadata: { to: newEmail } });
  res.json({ ok: true });
}

/** GET /me/activity — the signed-in user's own security activity (sign-ins, password changes…). */
export async function activity(req: Request, res: Response) {
  const { page, pageSize } = req.query as unknown as ActivityQuery;
  const rows = await listAuditLogs({ userId: req.auth!.user.id, limit: pageSize, offset: (page - 1) * pageSize });
  res.json({ events: rows.map(serializeAuditLog) });
}

/** DELETE /me */
export async function remove(req: Request, res: Response) {
  const { password } = req.body as DeleteAccountInput;
  const { user } = req.auth!;
  await users.assertPassword(user, password);
  await users.deleteAccount(user);
  await audit(req, { action: 'user.deleted', actorId: null, targetType: 'user', targetId: user.id, metadata: { email: user.email, self: true } });
  clearSessionCookie(res);
  res.status(204).end();
}
