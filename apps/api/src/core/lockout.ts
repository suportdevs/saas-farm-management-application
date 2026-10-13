import { eq, sql } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db/client';
import { rateLimits } from '../db/schema';
import { AppError } from '../lib/errors';

/**
 * Brute-force protection for credentials. Failed attempts are counted per
 * account+IP (and, with a higher threshold, per account from any IP). Once a
 * counter hits its limit the key is locked for LOGIN_LOCKOUT_MINUTES.
 * Counters live in the shared `rate_limits` table, so every API instance agrees.
 */

const keys = (email: string, ip: string | undefined) => [
  { key: `lockout:${email.toLowerCase()}|${ip ?? 'unknown'}`, max: env.LOGIN_MAX_ATTEMPTS },
  // Distributed guessing from many IPs — higher threshold to limit lock-out abuse.
  { key: `lockout:${email.toLowerCase()}`, max: env.LOGIN_MAX_ATTEMPTS * 4 },
];

const lockoutMs = () => env.LOGIN_LOCKOUT_MINUTES * 60_000;

export class AccountLockedError extends AppError {
  constructor(public readonly retryAfterSeconds: number) {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    super(
      429,
      'ACCOUNT_LOCKED',
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'} or reset your password.`,
    );
  }
}

/** Throws AccountLockedError if this email/IP is currently locked. */
export async function assertNotLocked(email: string, ip: string | undefined) {
  if (env.LOGIN_MAX_ATTEMPTS <= 0) return;
  for (const { key, max } of keys(email, ip)) {
    const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
    if (row && row.hits >= max && row.resetAt > new Date()) {
      throw new AccountLockedError(Math.ceil((row.resetAt.getTime() - Date.now()) / 1000));
    }
  }
}

/** Counts a failed attempt; returns attempts left before lockout (per account+IP). */
export async function recordFailedAttempt(email: string, ip: string | undefined): Promise<number> {
  if (env.LOGIN_MAX_ATTEMPTS <= 0) return Infinity;
  let remaining = Infinity;
  for (const { key, max } of keys(email, ip)) {
    const window = new Date(Date.now() + lockoutMs()).toISOString();
    const expired = sql`${rateLimits.resetAt} <= now()`;
    const [row] = await db
      .insert(rateLimits)
      .values({ key, hits: 1, resetAt: new Date(Date.now() + lockoutMs()) })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          hits: sql`case when ${expired} then 1 else ${rateLimits.hits} + 1 end`,
          // The lock lasts a full period from the attempt that triggered it.
          resetAt: sql`case when ${expired} or ${rateLimits.hits} + 1 >= ${max} then ${window}::timestamptz else ${rateLimits.resetAt} end`,
        },
      })
      .returning();
    remaining = Math.min(remaining, Math.max(0, max - row!.hits));
  }
  return remaining;
}

export async function clearFailedAttempts(email: string, ip: string | undefined) {
  for (const { key } of keys(email, ip)) await db.delete(rateLimits).where(eq(rateLimits.key, key));
}
