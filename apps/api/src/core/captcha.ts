import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { db } from '../db/client';
import { rateLimits } from '../db/schema';
import { decrypt, encrypt, randomToken } from '../lib/crypto';
import { badRequest } from '../lib/errors';

/**
 * Stateless math captcha. The answer travels inside an AES-GCM encrypted
 * token, so nothing is stored until it's used; used tokens are recorded so a
 * solved captcha can't be replayed.
 */

const PURPOSE = 'captcha';
const TTL_MS = 10 * 60 * 1000;

export type CaptchaForm = 'login' | 'register' | 'forgot-password' | 'magic-link';

export const captchaEnabledFor = (form: CaptchaForm) => env.CAPTCHA_ENABLED && env.CAPTCHA_FORMS.includes(form);

export function createCaptcha(): { token: string; question: string } {
  const a = crypto.randomInt(1, 20);
  const b = crypto.randomInt(1, 20);
  // Subtraction always keeps the larger number first so answers stay positive.
  const add = crypto.randomInt(0, 2) === 0;
  const [x, y] = add ? [a, b] : [Math.max(a, b), Math.min(a, b)];
  const answer = add ? x + y : x - y;
  const token = encrypt(JSON.stringify({ answer, exp: Date.now() + TTL_MS, nonce: randomToken(12) }), PURPOSE);
  return { token, question: `${x} ${add ? '+' : '−'} ${y}` };
}

async function verifyCaptcha(input: unknown): Promise<boolean> {
  if (!input || typeof input !== 'object') return false;
  const { token, answer } = input as { token?: unknown; answer?: unknown };
  if (typeof token !== 'string' || (typeof answer !== 'string' && typeof answer !== 'number')) return false;
  let payload: { answer: number; exp: number; nonce: string };
  try {
    payload = JSON.parse(decrypt(token, PURPOSE));
  } catch {
    return false;
  }
  if (payload.exp < Date.now() || Number(String(answer).trim()) !== payload.answer) return false;
  // Single use: the first request to record the nonce wins.
  const [fresh] = await db
    .insert(rateLimits)
    .values({ key: `captcha:${payload.nonce}`, hits: 1, resetAt: new Date(payload.exp) })
    .onConflictDoNothing()
    .returning();
  return Boolean(fresh);
}

/** Requires `body.captcha = { token, answer }` when the captcha is enabled for this form. */
export function requireCaptcha(form: CaptchaForm) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!captchaEnabledFor(form)) return next();
    if (!(await verifyCaptcha(req.body?.captcha))) {
      throw badRequest('The answer to the security question is wrong. Please try again.', 'INVALID_CAPTCHA');
    }
    next();
  };
}
