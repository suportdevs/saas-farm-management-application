import { rateLimit, type ClientRateLimitInfo, type Options, type Store } from 'express-rate-limit';
import { eq, lt, sql } from 'drizzle-orm';
import type { ApiErrorBody } from '@kit/shared';
import { env, isProd, isTest } from '../config/env';
import { db } from '../db/client';
import { rateLimits } from '../db/schema';

/**
 * Rate-limit store backed by the `rate_limits` table, so counters are shared
 * by every API instance. Enable with RATE_LIMIT_STORE=postgres.
 */
export class PostgresStore implements Store {
  windowMs = 60_000;
  constructor(public readonly prefix: string) {}

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const resetAt = new Date(Date.now() + this.windowMs);
    const expired = sql`${rateLimits.resetAt} <= now()`;
    const [row] = await db
      .insert(rateLimits)
      .values({ key: this.prefix + key, hits: 1, resetAt })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          hits: sql`case when ${expired} then 1 else ${rateLimits.hits} + 1 end`,
          resetAt: sql`case when ${expired} then ${resetAt.toISOString()}::timestamptz else ${rateLimits.resetAt} end`,
        },
      })
      .returning();
    return { totalHits: row!.hits, resetTime: row!.resetAt };
  }

  async decrement(key: string) {
    await db
      .update(rateLimits)
      .set({ hits: sql`greatest(${rateLimits.hits} - 1, 0)` })
      .where(eq(rateLimits.key, this.prefix + key));
  }

  async resetKey(key: string) {
    await db.delete(rateLimits).where(eq(rateLimits.key, this.prefix + key));
  }
}

export async function purgeExpiredRateLimits() {
  await db.delete(rateLimits).where(lt(rateLimits.resetAt, new Date()));
}

let counter = 0;

/**
 * Creates a rate limiter. Pass a unique `name` so counters stay separate when
 * using the shared Postgres store.
 */
export function limiter(opts: Partial<Options> & { windowMs: number; limit: number; name?: string }) {
  const { name = `limiter${++counter}`, ...options } = opts;
  return rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => isTest,
    // If the store is unavailable (e.g. DB hiccup), let requests through rather than failing them.
    passOnStoreError: true,
    store: env.RATE_LIMIT_STORE === 'postgres' ? new PostgresStore(`${name}:`) : undefined,
    handler: (_req, res, _next, options) => {
      const body: ApiErrorBody = {
        error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
      };
      res.status(options.statusCode).json(body);
    },
    ...options,
  });
}

/** Strict limiter for credential endpoints (login, register, reset). */
export const authLimiter = limiter({ name: 'auth', windowMs: 15 * 60 * 1000, limit: isProd ? 20 : 500 });
/** General API limiter. */
export const apiLimiter = limiter({ name: 'api', windowMs: 60 * 1000, limit: 300 });
