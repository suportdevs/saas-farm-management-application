import { Router } from 'express';
import { eq } from 'drizzle-orm';
import {
  confirmEmailChangeSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type ConfirmEmailChangeInput,
  type ForgotPasswordInput,
  type Impersonator,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type SessionInfo,
  type VerifyEmailInput,
} from '@kit/shared';
import { audit } from '../../core/audit';
import { signIn } from '../../core/auth-flow';
import { createCaptcha, requireCaptcha } from '../../core/captcha';
import { AccountLockedError, assertNotLocked, clearFailedAttempts, recordFailedAttempt } from '../../core/lockout';
import { env } from '../../config/env';
import {
  clearImpersonatorCookie,
  clearSessionCookie,
  deleteSession,
  deleteUserSessions,
  impersonatorCookieName,
  listUserSessions,
  setSessionCookie,
  validateSessionToken,
} from '../../core/session';
import { serializeUser } from '../../core/user';
import { db } from '../../db/client';
import { users } from '../../db/schema';
import { badRequest, notFound, unauthorized } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rate-limit';
import { validate } from '../../middleware/validate';
import * as auth from './service';

export const authRouter = Router();

/** A fresh math question for forms protected by the captcha. */
authRouter.get('/captcha', authLimiter, (_req, res) => {
  res.set('Cache-Control', 'no-store').json(createCaptcha());
});

authRouter.post('/register', authLimiter, validate(registerSchema), requireCaptcha('register'), async (req, res) => {
  const input = req.body as RegisterInput;
  const user = await auth.registerUser(input);
  await audit(req, { action: 'auth.register', actorId: user.id });
  const result = await signIn(req, res, user, { method: 'password' });
  res.status(201).json(result);
});

authRouter.post('/login', authLimiter, validate(loginSchema), requireCaptcha('login'), async (req, res) => {
  const { email, password, remember } = req.body as LoginInput;
  await assertNotLocked(email, req.ip);
  const user = await auth.authenticate(email, password);
  if (!user) {
    const remaining = await recordFailedAttempt(email, req.ip);
    await audit(req, { action: 'auth.login_failed', actorId: null, metadata: { email, remaining } });
    if (remaining === 0) {
      await audit(req, { action: 'auth.locked_out', actorId: null, metadata: { email } });
      throw new AccountLockedError(env.LOGIN_LOCKOUT_MINUTES * 60);
    }
    const hint = remaining <= 2 ? ` ${remaining} attempt${remaining === 1 ? '' : 's'} left before your account is temporarily locked.` : '';
    throw unauthorized(`Invalid email or password.${hint}`, 'INVALID_CREDENTIALS');
  }
  await clearFailedAttempts(email, req.ip);
  res.json(await signIn(req, res, user, { method: 'password', persistent: remember ?? true }));
});

authRouter.post('/logout', async (req, res) => {
  if (req.auth) {
    await deleteSession(req.auth.session.id);
    if (!req.auth.session.pending) await audit(req, { action: 'auth.logout' });
  }
  clearSessionCookie(res);
  clearImpersonatorCookie(res);
  res.status(204).end();
});

async function impersonatorOf(id: string | null): Promise<Impersonator | null> {
  if (!id) return null;
  const admin = await db.query.users.findFirst({ where: eq(users.id, id) });
  return admin ? { id: admin.id, name: admin.name, email: admin.email } : null;
}

/** Always 200 — tells the client whether it's signed in, or mid-challenge. */
authRouter.get('/session', async (req, res) => {
  if (!req.auth) return res.json({ user: null, challenge: null, impersonator: null });
  if (req.auth.session.pending) {
    return res.json({ user: null, challenge: req.auth.session.pending, impersonator: null });
  }
  res.json({
    user: await serializeUser(req.auth.user),
    challenge: null,
    impersonator: await impersonatorOf(req.auth.session.impersonatorId),
  });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await serializeUser(req.auth!.user) });
});

authRouter.post('/verify-email', authLimiter, validate(verifyEmailSchema), async (req, res) => {
  const { token } = req.body as VerifyEmailInput;
  if (!(await auth.verifyEmail(token))) {
    throw badRequest('This verification link is invalid or has expired', 'INVALID_TOKEN');
  }
  res.json({ ok: true });
});

authRouter.post('/verify-email/resend', requireAuth, authLimiter, async (req, res) => {
  await auth.sendEmailVerification(req.auth!.user);
  res.json({ ok: true });
});

authRouter.post('/confirm-email-change', authLimiter, validate(confirmEmailChangeSchema), async (req, res) => {
  const { token } = req.body as ConfirmEmailChangeInput;
  const result = await auth.confirmEmailChange(token);
  if (!result) throw badRequest('This confirmation link is invalid or has expired', 'INVALID_TOKEN');
  await audit(req, {
    action: 'user.email_changed',
    actorId: result.userId,
    targetType: 'user',
    targetId: result.userId,
    metadata: { from: result.from, to: result.to },
  });
  res.json({ ok: true, email: result.to });
});

authRouter.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), requireCaptcha('forgot-password'), async (req, res) => {
  const { email } = req.body as ForgotPasswordInput;
  await auth.requestPasswordReset(email);
  res.json({ ok: true });
});

authRouter.post('/reset-password', authLimiter, validate(resetPasswordSchema), async (req, res) => {
  const { token, password } = req.body as ResetPasswordInput;
  const userId = await auth.resetPassword(token, password);
  if (!userId) throw badRequest('This reset link is invalid or has expired', 'INVALID_TOKEN');
  await audit(req, { action: 'auth.password_reset', actorId: userId, targetType: 'user', targetId: userId });
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** Ends an admin's impersonation and restores their own session if it is still valid. */
authRouter.post('/impersonation/stop', requireAuth, async (req, res) => {
  const { session, user } = req.auth!;
  if (!session.impersonatorId) throw badRequest('You are not impersonating anyone', 'NOT_IMPERSONATING');
  await deleteSession(session.id);
  await audit(req, {
    action: 'admin.impersonation_stopped',
    actorId: session.impersonatorId,
    targetType: 'user',
    targetId: user.id,
  });

  const adminToken = req.cookies?.[impersonatorCookieName()];
  clearImpersonatorCookie(res);
  const restored = typeof adminToken === 'string' ? await validateSessionToken(adminToken) : null;
  if (restored && restored.user.id === session.impersonatorId && !restored.session.pending) {
    setSessionCookie(res, adminToken, restored.session);
    return res.json({ restored: true, redirect: `/admin/users/${user.id}` });
  }
  clearSessionCookie(res);
  res.json({ restored: false, redirect: '/login' });
});

authRouter.get('/sessions', requireAuth, async (req, res) => {
  const current = req.auth!.session.id;
  const rows = await listUserSessions(req.auth!.user.id);
  const sessions: SessionInfo[] = rows
    .filter((s) => !s.pending && !s.impersonatorId)
    .map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      current: s.id === current,
    }));
  res.json({ sessions });
});

authRouter.delete('/sessions', requireAuth, async (req, res) => {
  await deleteUserSessions(req.auth!.user.id, req.auth!.session.id);
  await audit(req, { action: 'auth.sessions_revoked', metadata: { scope: 'others' } });
  res.status(204).end();
});

authRouter.delete('/sessions/:id', requireAuth, async (req, res) => {
  const sessions = await listUserSessions(req.auth!.user.id);
  const target = sessions.find((s) => s.id === req.params.id);
  if (!target) throw notFound('Session not found');
  await deleteSession(target.id);
  await audit(req, { action: 'auth.session_revoked', targetType: 'session', targetId: target.id });
  if (target.id === req.auth!.session.id) clearSessionCookie(res);
  res.status(204).end();
});
