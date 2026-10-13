import type { CookieOptions, Request, Response } from 'express';
import { and, eq, gt, lt, ne } from 'drizzle-orm';
import { env, isProd } from '../config/env';
import { db } from '../db/client';
import { sessions, users, type Session, type User } from '../db/schema';
import { randomToken, sha256 } from '../lib/crypto';

const DAY = 24 * 60 * 60 * 1000;
const PENDING_TTL = 10 * 60 * 1000; // challenge sessions expire after 10 minutes
const NON_PERSISTENT_TTL = 1 * DAY;
const IMPERSONATION_TTL = 60 * 60 * 1000; // admins get one hour as another user
const persistentTtl = () => env.SESSION_TTL_DAYS * DAY;

export const sessionCookieName = () => env.SESSION_COOKIE_NAME;
/** Holds the admin's own session token while they impersonate someone. */
export const impersonatorCookieName = () => `${env.SESSION_COOKIE_NAME}_admin`;

function cookieOptions(expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    ...(expires ? { expires } : {}),
  };
}

export function setSessionCookie(res: Response, token: string, session: Pick<Session, 'persistent' | 'expiresAt'>) {
  res.cookie(sessionCookieName(), token, cookieOptions(session.persistent ? session.expiresAt : undefined));
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(sessionCookieName(), cookieOptions());
}

export function setImpersonatorCookie(res: Response, token: string) {
  res.cookie(impersonatorCookieName(), token, cookieOptions());
}

export function clearImpersonatorCookie(res: Response) {
  res.clearCookie(impersonatorCookieName(), cookieOptions());
}

function clientInfo(req: Request) {
  return {
    userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
    ip: req.ip?.slice(0, 64) ?? null,
  };
}

export async function createSession(
  req: Request,
  userId: string,
  opts: { persistent?: boolean; pending?: string | null; impersonatorId?: string } = {},
): Promise<{ token: string; session: Session }> {
  const token = randomToken();
  const persistent = opts.impersonatorId ? false : (opts.persistent ?? true);
  const ttl = opts.pending
    ? PENDING_TTL
    : opts.impersonatorId
      ? IMPERSONATION_TTL
      : persistent
        ? persistentTtl()
        : NON_PERSISTENT_TTL;
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: sha256(token),
      pending: opts.pending ?? null,
      persistent,
      impersonatorId: opts.impersonatorId ?? null,
      expiresAt: new Date(Date.now() + ttl),
      ...clientInfo(req),
    })
    .returning();
  return { token, session: session! };
}

/**
 * Validates a raw session token. Active sessions use a sliding expiry: once
 * past half their lifetime they are extended (and `renewed` is set so the
 * caller can refresh the cookie).
 */
export async function validateSessionToken(
  token: string,
): Promise<{ session: Session; user: User; renewed: boolean } | null> {
  const row = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1)
    .then((r) => r[0]);
  if (!row) return null;

  const { session, user } = row;
  if (user.bannedAt) {
    await deleteUserSessions(user.id);
    return null;
  }
  let renewed = false;
  if (!session.pending) {
    const ttl = session.persistent ? persistentTtl() : NON_PERSISTENT_TTL;
    const now = Date.now();
    // Impersonation sessions have a hard expiry and are never extended.
    const shouldExtend = !session.impersonatorId && session.expiresAt.getTime() - now < ttl / 2;
    const shouldTouch = now - session.lastSeenAt.getTime() > 5 * 60 * 1000;
    if (shouldExtend || shouldTouch) {
      const patch: Partial<Session> = { lastSeenAt: new Date(now) };
      if (shouldExtend) {
        patch.expiresAt = new Date(now + ttl);
        renewed = true;
      }
      await db.update(sessions).set(patch).where(eq(sessions.id, session.id));
      Object.assign(session, patch);
    }
  }
  return { session, user, renewed };
}

/** Marks a challenge as completed, turning a pending session into a full one. */
export async function completeSessionChallenge(sessionId: string): Promise<Session> {
  const current = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!current) throw new Error('Session not found');
  const ttl = current.persistent ? persistentTtl() : NON_PERSISTENT_TTL;
  const [session] = await db
    .update(sessions)
    .set({ pending: null, expiresAt: new Date(Date.now() + ttl), lastSeenAt: new Date() })
    .where(eq(sessions.id, sessionId))
    .returning();
  return session!;
}

export async function deleteSession(sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteUserSessions(userId: string, exceptSessionId?: string) {
  await db
    .delete(sessions)
    .where(
      exceptSessionId
        ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
        : eq(sessions.userId, userId),
    );
}

export async function listUserSessions(userId: string) {
  return db.query.sessions.findMany({
    where: and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())),
    orderBy: (s, { desc }) => [desc(s.lastSeenAt)],
  });
}

export async function purgeExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
