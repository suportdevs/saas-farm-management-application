import type { Request, Response } from 'express';
import type {
  ConfirmEmailChangeInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '@kit/shared';
import { env } from '../../../config/env';
import { audit } from '../../../core/audit';
import { signIn } from '../../../core/auth-flow';
import { createCaptcha } from '../../../core/captcha';
import { AccountLockedError, assertNotLocked, clearFailedAttempts, recordFailedAttempt } from '../../../core/lockout';
import {
  clearImpersonatorCookie,
  clearSessionCookie,
  deleteSession,
  impersonatorCookieName,
  setSessionCookie,
  validateSessionToken,
} from '../../../core/session';
import { serializeUser } from '../../../core/user';
import { badRequest, unauthorized } from '../../../lib/errors';
import * as auth from '../services/auth.service';

/** GET /captcha — a fresh math question for forms protected by the captcha. */
export function captcha(_req: Request, res: Response) {
  res.set('Cache-Control', 'no-store').json(createCaptcha());
}

/** POST /register */
export async function register(req: Request, res: Response) {
  const input = req.body as RegisterInput;
  const user = await auth.registerUser(input);
  await audit(req, { action: 'auth.register', actorId: user.id });
  const result = await signIn(req, res, user, { method: 'password' });
  res.status(201).json(result);
}

/** POST /login — failed attempts count towards a temporary lockout. */
export async function login(req: Request, res: Response) {
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
}

/** POST /logout */
export async function logout(req: Request, res: Response) {
  if (req.auth) {
    await deleteSession(req.auth.session.id);
    if (!req.auth.session.pending) await audit(req, { action: 'auth.logout' });
  }
  clearSessionCookie(res);
  clearImpersonatorCookie(res);
  res.status(204).end();
}

/** GET /session — always 200: tells the client whether it's signed in, or mid-challenge. */
export async function session(req: Request, res: Response) {
  if (!req.auth) return res.json({ user: null, challenge: null, impersonator: null });
  if (req.auth.session.pending) {
    return res.json({ user: null, challenge: req.auth.session.pending, impersonator: null });
  }
  res.json({
    user: await serializeUser(req.auth.user),
    challenge: null,
    impersonator: await auth.impersonatorOf(req.auth.session.impersonatorId),
  });
}

/** GET /me */
export async function me(req: Request, res: Response) {
  res.json({ user: await serializeUser(req.auth!.user) });
}

/** POST /verify-email */
export async function verifyEmail(req: Request, res: Response) {
  const { token } = req.body as VerifyEmailInput;
  if (!(await auth.verifyEmail(token))) {
    throw badRequest('This verification link is invalid or has expired', 'INVALID_TOKEN');
  }
  res.json({ ok: true });
}

/** POST /verify-email/resend */
export async function resendVerification(req: Request, res: Response) {
  await auth.sendEmailVerification(req.auth!.user);
  res.json({ ok: true });
}

/** POST /confirm-email-change */
export async function confirmEmailChange(req: Request, res: Response) {
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
}

/** POST /forgot-password */
export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body as ForgotPasswordInput;
  await auth.requestPasswordReset(email);
  res.json({ ok: true });
}

/** POST /reset-password */
export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body as ResetPasswordInput;
  const userId = await auth.resetPassword(token, password);
  if (!userId) throw badRequest('This reset link is invalid or has expired', 'INVALID_TOKEN');
  await audit(req, { action: 'auth.password_reset', actorId: userId, targetType: 'user', targetId: userId });
  clearSessionCookie(res);
  res.json({ ok: true });
}

/** POST /impersonation/stop — ends an admin's impersonation and restores their own session if it is still valid. */
export async function stopImpersonation(req: Request, res: Response) {
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
}
