import crypto from 'node:crypto';
import { count, desc, eq } from 'drizzle-orm';
import { db, env, logger, users, type User } from '../../core';
import { referralCodes, referrals } from './schema';

export const REFERRAL_COOKIE = 'ref';

// No look-alike characters (0/o, 1/l/i) so codes survive being read aloud.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const newCode = () => Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join('');

export async function getOrCreateCode(userId: string): Promise<string> {
  const [existing] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId)).limit(1);
  if (existing) return existing.code;
  for (let i = 0; i < 5; i++) {
    const [row] = await db.insert(referralCodes).values({ userId, code: newCode() }).onConflictDoNothing().returning();
    if (row) return row.code;
    // Either the code collided or another request created this user's code — re-check.
    const [raced] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId)).limit(1);
    if (raced) return raced.code;
  }
  throw new Error('Could not allocate a referral code');
}

export const referralUrl = (code: string) => `${env.WEB_URL}/register?ref=${code}`;

async function findByCode(code: string) {
  const [row] = await db
    .select({ userId: referralCodes.userId, name: users.name })
    .from(referralCodes)
    .innerJoin(users, eq(users.id, referralCodes.userId))
    .where(eq(referralCodes.code, code.toLowerCase()))
    .limit(1);
  return row;
}

/** Credits the referrer when a new account is created from their link. */
export async function recordSignup(user: User, code: string | undefined) {
  if (!code) return;
  const referrer = await findByCode(code);
  if (!referrer || referrer.userId === user.id) return;
  await db.insert(referrals).values({ referredUserId: user.id, referrerId: referrer.userId, code: code.toLowerCase() }).onConflictDoNothing();
  logger.info({ referrerId: referrer.userId, userId: user.id }, 'Referral sign-up recorded');
}

/** "Jane Doe" → "Jane D." so referrers don't see full identities. */
const shortName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest.at(-1)![0]}.` : (first ?? 'Someone');
};

export async function referralStats(userId: string) {
  const code = await getOrCreateCode(userId);
  const [rows, [totals]] = await Promise.all([
    db
      .select({ name: users.name, joinedAt: referrals.createdAt, verifiedAt: users.emailVerifiedAt })
      .from(referrals)
      .innerJoin(users, eq(users.id, referrals.referredUserId))
      .where(eq(referrals.referrerId, userId))
      .orderBy(desc(referrals.createdAt))
      .limit(20),
    db
      .select({ signups: count(), verified: count(users.emailVerifiedAt) })
      .from(referrals)
      .innerJoin(users, eq(users.id, referrals.referredUserId))
      .where(eq(referrals.referrerId, userId)),
  ]);
  return {
    code,
    url: referralUrl(code),
    stats: { signups: totals?.signups ?? 0, verified: totals?.verified ?? 0 },
    referrals: rows.map((r) => ({ name: shortName(r.name), joinedAt: r.joinedAt.toISOString(), verified: Boolean(r.verifiedAt) })),
  };
}

/** Who referred this user (for admin views / rewards logic). */
export async function referrerOf(userId: string) {
  const [row] = await db
    .select({ referrerId: referrals.referrerId })
    .from(referrals)
    .where(eq(referrals.referredUserId, userId))
    .limit(1);
  return row?.referrerId ?? null;
}
