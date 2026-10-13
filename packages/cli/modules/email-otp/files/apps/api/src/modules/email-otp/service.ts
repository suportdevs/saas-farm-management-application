import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { AppError, badRequest, db, env, parseModuleEnv, renderEmail, safeEqual, sendMail, sha256, type User } from '../../core';
import { emailOtpChallenges, emailOtpSettings } from './schema';

export const CHALLENGE = 'email-otp';

const config = parseModuleEnv(
  'email-otp',
  z.object({
    EMAIL_OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
    EMAIL_OTP_RESEND_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
    EMAIL_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  }),
);

// Bound to the session so a code can't be used to complete a different sign-in.
const hashCode = (sessionId: string, code: string) => sha256(`${sessionId}:${code}`);

/** "jane.doe@example.com" → "ja•••@example.com" */
export function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(local.length - 2, 5)))}@${domain}`;
}

export async function isEnabled(userId: string) {
  const [row] = await db.select().from(emailOtpSettings).where(eq(emailOtpSettings.userId, userId)).limit(1);
  return Boolean(row);
}

export async function setEnabled(userId: string, enabled: boolean) {
  if (enabled) await db.insert(emailOtpSettings).values({ userId }).onConflictDoNothing();
  else await db.delete(emailOtpSettings).where(eq(emailOtpSettings.userId, userId));
}

async function getChallenge(sessionId: string) {
  const [row] = await db.select().from(emailOtpChallenges).where(eq(emailOtpChallenges.sessionId, sessionId)).limit(1);
  return row;
}

/**
 * Sends a code unless one was sent within the cooldown. Safe to call on every
 * page load: a refresh never spams the inbox.
 */
export async function sendCode(sessionId: string, user: User, opts: { force?: boolean } = {}) {
  const existing = await getChallenge(sessionId);
  const cooldownMs = config.EMAIL_OTP_RESEND_SECONDS * 1000;
  if (existing && existing.expiresAt > new Date()) {
    const waitMs = existing.lastSentAt.getTime() + cooldownMs - Date.now();
    if (waitMs > 0) {
      if (opts.force) {
        throw new AppError(429, 'RESEND_TOO_SOON', `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code`);
      }
      return { sent: false, resendIn: Math.ceil(waitMs / 1000) };
    }
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const values = {
    codeHash: hashCode(sessionId, code),
    expiresAt: new Date(Date.now() + config.EMAIL_OTP_TTL_MINUTES * 60_000),
    attempts: 0,
    lastSentAt: new Date(),
  };
  await db
    .insert(emailOtpChallenges)
    .values({ sessionId, ...values })
    .onConflictDoUpdate({ target: emailOtpChallenges.sessionId, set: values });

  await sendMail({
    to: user.email,
    subject: `${code} is your ${env.APP_NAME} sign-in code`,
    ...renderEmail({
      heading: 'Your sign-in code',
      preheader: `Use ${code} to finish signing in.`,
      body: [`Hi ${user.name.split(' ')[0]},`, `Enter this code to finish signing in to ${env.APP_NAME}:`],
      code,
      note: `The code expires in ${config.EMAIL_OTP_TTL_MINUTES} minutes. If you didn't try to sign in, someone may know your password — change it right away.`,
    }),
  });
  return { sent: true, resendIn: config.EMAIL_OTP_RESEND_SECONDS };
}

/** Checks a code. Too many wrong guesses burn the code so a new one must be requested. */
export async function verifyCode(sessionId: string, code: string): Promise<void> {
  const challenge = await getChallenge(sessionId);
  if (!challenge || challenge.expiresAt < new Date()) {
    throw badRequest('This code has expired. Request a new one.', 'CODE_EXPIRED');
  }
  if (challenge.attempts >= config.EMAIL_OTP_MAX_ATTEMPTS) {
    await db.delete(emailOtpChallenges).where(eq(emailOtpChallenges.sessionId, sessionId));
    throw badRequest('Too many incorrect codes. Request a new one.', 'TOO_MANY_ATTEMPTS');
  }
  if (!safeEqual(challenge.codeHash, hashCode(sessionId, code.replace(/\s+/g, '')))) {
    await db
      .update(emailOtpChallenges)
      .set({ attempts: challenge.attempts + 1 })
      .where(eq(emailOtpChallenges.sessionId, sessionId));
    const left = config.EMAIL_OTP_MAX_ATTEMPTS - challenge.attempts - 1;
    throw badRequest(left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code.', 'INVALID_CODE');
  }
  await db.delete(emailOtpChallenges).where(eq(emailOtpChallenges.sessionId, sessionId));
}
