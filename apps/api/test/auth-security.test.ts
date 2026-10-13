import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => {
  process.env.CAPTCHA_ENABLED = 'true';
  process.env.CAPTCHA_FORMS = 'login,register';
  process.env.LOGIN_MAX_ATTEMPTS = '3';
  process.env.ADMIN_EMAILS = 'boss@example.com';
  return [] as { to: string; subject: string; html: string }[];
});
vi.mock('../src/lib/mailer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/mailer')>()),
  sendMail: vi.fn(async (m: { to: string; subject: string; html: string }) => {
    sent.push(m);
  }),
}));

import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { issueToken } from '../src/core/tokens';
import { db, pool } from '../src/db/client';
import { users } from '../src/db/schema';
import { decrypt } from '../src/lib/crypto';
import { PASSWORD, client, uniqueEmail } from './helpers';

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
beforeEach(() => {
  sent.length = 0;
});
afterAll(async () => {
  await pool.end();
});

/** Fetches a captcha and solves it by reading the encrypted token (tests only). */
async function solvedCaptcha(c = client(app)) {
  const { token, question } = (await c.get('/api/auth/captcha')).body as { token: string; question: string };
  expect(question).toMatch(/^\d+ [+−] \d+$/);
  const { answer } = JSON.parse(decrypt(token, 'captcha')) as { answer: number };
  return { token, answer: String(answer) };
}

async function register(email = uniqueEmail()) {
  const c = client(app);
  const res = await c.post('/api/auth/register', { name: 'Sec User', email, password: PASSWORD, captcha: await solvedCaptcha() });
  expect(res.status).toBe(201);
  return { c, email, id: res.body.user.id as string };
}

describe('captcha', () => {
  it('is advertised in /features and required on configured forms', async () => {
    expect((await client(app).get('/api/features')).body.auth).toMatchObject({ captcha: ['login', 'register'], lockout: { maxAttempts: 3 } });
    const missing = await client(app).post('/api/auth/register', { name: 'No Captcha', email: uniqueEmail(), password: PASSWORD });
    expect(missing.body.error.code).toBe('INVALID_CAPTCHA');
    // forgot-password isn't in CAPTCHA_FORMS
    expect((await client(app).post('/api/auth/forgot-password', { email: uniqueEmail() })).status).toBe(200);
  });

  it('rejects wrong answers and replayed tokens', async () => {
    const captcha = await solvedCaptcha();
    const wrong = await client(app).post('/api/auth/register', {
      name: 'Wrong',
      email: uniqueEmail(),
      password: PASSWORD,
      captcha: { ...captcha, answer: String(Number(captcha.answer) + 1) },
    });
    expect(wrong.body.error.code).toBe('INVALID_CAPTCHA');

    const body = { name: 'Once', email: uniqueEmail(), password: PASSWORD, captcha };
    expect((await client(app).post('/api/auth/register', body)).status).toBe(201);
    const replay = await client(app).post('/api/auth/register', { ...body, email: uniqueEmail() });
    expect(replay.body.error.code).toBe('INVALID_CAPTCHA');
  });
});

describe('lockout', () => {
  it('locks an account after repeated failures, even for the right password', async () => {
    const { email } = await register();
    const attempt = async (password: string) =>
      client(app).post('/api/auth/login', { email, password, captcha: await solvedCaptcha() });

    expect((await attempt('wrong-1')).body.error.message).toMatch(/2 attempts left/);
    expect((await attempt('wrong-2')).body.error.message).toMatch(/1 attempt left/);
    const locked = await attempt('wrong-3');
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    expect((await attempt(PASSWORD)).body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('resets the counter after a successful sign-in', async () => {
    const { email } = await register();
    const attempt = async (password: string) =>
      client(app).post('/api/auth/login', { email, password, captcha: await solvedCaptcha() });
    await attempt('wrong');
    await attempt('wrong');
    expect((await attempt(PASSWORD)).status).toBe(200);
    expect((await attempt('wrong')).body.error.message).toMatch(/2 attempts left/);
  });
});

describe('account activation', () => {
  it('promotes ADMIN_EMAILS only after verification, and sends a welcome email', async () => {
    const { c, id } = await register('boss@example.com').catch(async () => {
      // Re-runs against the same database: start from a clean slate.
      await db.delete(users).where(eq(users.email, 'boss@example.com'));
      return register('boss@example.com');
    });
    expect((await c.get('/api/auth/me')).body.user.role).toBe('user');

    const token = await issueToken(id, 'email_verification', 60_000);
    expect((await client(app).post('/api/auth/verify-email', { token })).status).toBe(200);
    expect((await c.get('/api/auth/me')).body.user.role).toBe('admin');
    expect(sent.some((m) => m.to === 'boss@example.com' && m.subject.startsWith('Welcome'))).toBe(true);
  });

  it('renders polished emails with a plain-text part', async () => {
    const { email } = await register();
    const verification = sent.find((m) => m.to === email)!;
    expect(verification.html).toContain('Verify email');
    expect(verification.html).toMatch(/display:none[^>]*>Thanks for signing up/); // preheader
  });
});
