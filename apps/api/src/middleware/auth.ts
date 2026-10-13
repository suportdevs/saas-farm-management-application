import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import type { User } from '../db/schema';
import { clearSessionCookie, sessionCookieName, setSessionCookie, validateSessionToken } from '../core/session';
import { forbidden, unauthorized } from '../lib/errors';

/** Global: resolves the session cookie into `req.auth` (if valid). Never rejects. */
export async function loadSession(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[sessionCookieName()];
  if (typeof token !== 'string' || !token) return next();

  const result = await validateSessionToken(token);
  if (!result) {
    clearSessionCookie(res);
    return next();
  }
  if (result.renewed) setSessionCookie(res, token, result.session);
  req.auth = { session: result.session, user: result.user, token };
  next();
}

/** Requires a fully authenticated session (no outstanding challenge). */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth || req.auth.session.pending) throw unauthorized();
  next();
}

/** Requires a session that is waiting on the given challenge (e.g. "two-factor"). */
export function requireChallenge(challenge: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth || req.auth.session.pending !== challenge) {
      throw unauthorized('No pending challenge — please sign in again', 'NO_PENDING_CHALLENGE');
    }
    next();
  };
}

export function requireRole(...roles: User['role'][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth || req.auth.session.pending) throw unauthorized();
    if (!roles.includes(req.auth.user.role)) throw forbidden();
    next();
  };
}

/** Blocks sensitive account changes while an admin is impersonating the user. */
export function forbidImpersonation(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.session.impersonatorId) {
    throw forbidden('This action is not available while impersonating a user', 'IMPERSONATION_RESTRICTED');
  }
  next();
}

// Reachable while EMAIL_VERIFICATION=required and the address isn't verified yet.
const UNVERIFIED_ALLOWED = ['/auth/', '/features', '/users/me/email', '/billing/plans', '/organizations/invitations/lookup', '/farms/invitations/lookup'];

/** Global: with EMAIL_VERIFICATION=required, unverified users can only use auth/account endpoints. */
export function enforceEmailVerification(req: Request, _res: Response, next: NextFunction) {
  if (env.EMAIL_VERIFICATION !== 'required' || !req.auth || req.auth.session.pending) return next();
  if (req.auth.user.emailVerifiedAt) return next();
  const allowed =
    UNVERIFIED_ALLOWED.some((p) => req.path === p || req.path.startsWith(p)) || (req.method === 'DELETE' && req.path === '/users/me');
  if (!allowed) throw forbidden('Please verify your email address first', 'EMAIL_NOT_VERIFIED');
  next();
}

export function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth || req.auth.session.pending) throw unauthorized();
  if (!req.auth.user.emailVerifiedAt) throw forbidden('Please verify your email address first', 'EMAIL_NOT_VERIFIED');
  next();
}
