import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import type { LoginResponse } from '@kit/shared';
import { db } from '../db/client';
import { users, type User } from '../db/schema';
import { forbidden } from '../lib/errors';
import { audit } from './audit';
import { hooks } from './hooks';
import { completeSessionChallenge, createSession, setSessionCookie } from './session';
import { serializeUser } from './user';

export const accountSuspended = () =>
  forbidden('This account has been suspended. Contact support if you think this is a mistake.', 'ACCOUNT_SUSPENDED');

/**
 * The single entry point for signing a user in — used by password login,
 * social login and any future method. Login guards (e.g. two-factor) may turn
 * the session into a pending one that requires an extra step.
 */
export async function signIn(
  req: Request,
  res: Response,
  user: User,
  opts: { method: string; persistent?: boolean },
): Promise<LoginResponse> {
  if (user.bannedAt) {
    await audit(req, { action: 'auth.login_blocked', actorId: user.id, metadata: { method: opts.method, reason: 'suspended' } });
    throw accountSuspended();
  }
  const challenge = await hooks.runLoginGuards({ user, req, method: opts.method });
  const { token, session } = await createSession(req, user.id, {
    persistent: opts.persistent,
    pending: challenge,
  });
  setSessionCookie(res, token, session);
  if (challenge) return { challenge };
  await recordLogin(req, user, opts.method);
  return { user: await serializeUser(user) };
}

/** Call after a module verifies its challenge (e.g. a valid TOTP code). */
export async function completeChallenge(req: Request, res: Response): Promise<LoginResponse> {
  const auth = req.auth!;
  const challenge = auth.session.pending;
  const session = await completeSessionChallenge(auth.session.id);
  setSessionCookie(res, auth.token, session);
  await recordLogin(req, auth.user, `challenge:${challenge}`);
  return { user: await serializeUser(auth.user) };
}

async function recordLogin(req: Request, user: User, method: string) {
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await audit(req, { action: 'auth.login', actorId: user.id, metadata: { method } });
}
