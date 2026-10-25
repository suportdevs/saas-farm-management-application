import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  changeEmailSchema,
  changePasswordSchema,
  deleteAccountSchema,
  updateProfileSchema,
  type ChangeEmailInput,
  type ChangePasswordInput,
  type DeleteAccountInput,
  type UpdateProfileInput,
} from '@kit/shared';
import { db } from '../../db/client';
import { users } from '../../db/schema';
import { audit, listAuditLogs, serializeAuditLog } from '../../core/audit';
import { hooks } from '../../core/hooks';
import { clearSessionCookie, deleteUserSessions } from '../../core/session';
import { serializeUser } from '../../core/user';
import { badRequest } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { forbidImpersonation, requireAuth } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rate-limit';
import { validate } from '../../middleware/validate';
import { sendPasswordChangedEmail } from '../auth/emails';
import { requestEmailChange } from '../auth/service';

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.patch('/me', validate(updateProfileSchema), async (req, res) => {
  const { name } = req.body as UpdateProfileInput;
  const [user] = await db.update(users).set({ name }).where(eq(users.id, req.auth!.user.id)).returning();
  await audit(req, { action: 'user.profile_updated', targetType: 'user', targetId: user!.id });
  res.json({ user: await serializeUser(user!) });
});

usersRouter.post('/me/password', forbidImpersonation, authLimiter, validate(changePasswordSchema), async (req, res) => {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;
  const { user, session } = req.auth!;
  if (user.passwordHash) {
    if (!currentPassword || !(await verifyPassword(user.passwordHash, currentPassword))) {
      throw badRequest('Current password is incorrect', 'INVALID_PASSWORD');
    }
  }
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, user.id));
  await deleteUserSessions(user.id, session.id);
  await sendPasswordChangedEmail(user.email, user.name);
  await audit(req, { action: user.passwordHash ? 'user.password_changed' : 'user.password_set', targetType: 'user', targetId: user.id });
  res.json({ ok: true });
});

/** Sends a confirmation link to the new address; the change applies once it's clicked. */
usersRouter.post('/me/email', forbidImpersonation, authLimiter, validate(changeEmailSchema), async (req, res) => {
  const { newEmail, password } = req.body as ChangeEmailInput;
  const { user } = req.auth!;
  if (user.passwordHash && !(password && (await verifyPassword(user.passwordHash, password)))) {
    throw badRequest('Password is incorrect', 'INVALID_PASSWORD');
  }
  await requestEmailChange(user, newEmail);
  await audit(req, { action: 'user.email_change_requested', targetType: 'user', targetId: user.id, metadata: { to: newEmail } });
  res.json({ ok: true });
});

const activityQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/** The signed-in user's own security activity (sign-ins, password changes…). */
usersRouter.get('/me/activity', validate(activityQuery, 'query'), async (req, res) => {
  const { page, pageSize } = req.query as unknown as z.infer<typeof activityQuery>;
  const rows = await listAuditLogs({ userId: req.auth!.user.id, limit: pageSize, offset: (page - 1) * pageSize });
  res.json({ events: rows.map(serializeAuditLog) });
});

usersRouter.delete('/me', forbidImpersonation, authLimiter, validate(deleteAccountSchema), async (req, res) => {
  const { password } = req.body as DeleteAccountInput;
  const { user } = req.auth!;
  if (user.passwordHash && !(password && (await verifyPassword(user.passwordHash, password)))) {
    throw badRequest('Password is incorrect', 'INVALID_PASSWORD');
  }
  await hooks.emit(hooks.userDeleting, user);
  await db.delete(users).where(eq(users.id, user.id)); // sessions & module rows cascade
  await audit(req, { action: 'user.deleted', actorId: null, targetType: 'user', targetId: user.id, metadata: { email: user.email, self: true } });
  clearSessionCookie(res);
  res.status(204).end();
});
