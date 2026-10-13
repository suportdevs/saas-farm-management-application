import type { Express } from 'express';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => [] as { to: string; subject: string }[]);
vi.mock('../src/lib/mailer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/mailer')>()),
  sendMail: vi.fn(async (m: { to: string; subject: string }) => {
    sent.push(m);
  }),
}));

import { createApp } from '../src/app';
import { db, pool } from '../src/db/client';
import { users } from '../src/db/schema';
import { PASSWORD, client, signUp } from './helpers';

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

/** The code is the first 6 digits of the subject line ("123456 is your … code"). */
const codeMails = (email: string) => sent.filter((m) => m.to === email && m.subject.includes('sign-in code'));
const lastCode = (email: string) => codeMails(email).at(-1)?.subject.slice(0, 6);

async function userWithEmailOtp() {
  const u = await signUp(app);
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, u.id));
  expect((await u.c.post('/api/email-otp/enable', { password: PASSWORD })).status).toBe(200);
  return u;
}

describe('email OTP', () => {
  it('requires a verified email to enable', async () => {
    const u = await signUp(app);
    const res = await u.c.post('/api/email-otp/enable', { password: PASSWORD });
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('challenges sign-in and accepts the emailed code', async () => {
    const { email } = await userWithEmailOtp();
    const c = client(app);
    const login = await c.post('/api/auth/login', { email, password: PASSWORD });
    expect(login.body).toEqual({ challenge: 'email-otp' });
    expect((await c.get('/api/auth/me')).status).toBe(401);

    const first = await c.post('/api/email-otp/send');
    expect(first.body).toMatchObject({ sent: true, sentTo: expect.stringContaining('@example.com') });
    // A page refresh doesn't send another email.
    expect((await c.post('/api/email-otp/send')).body.sent).toBe(false);
    expect((await c.post('/api/email-otp/send', { resend: true })).body.error.code).toBe('RESEND_TOO_SOON');
    expect(codeMails(email)).toHaveLength(1);

    const ok = await c.post('/api/email-otp/verify', { code: lastCode(email) });
    expect(ok.body.user.email).toBe(email);
    expect((await c.get('/api/auth/me')).status).toBe(200);
  });

  it('burns the code after too many wrong guesses', async () => {
    const { email } = await userWithEmailOtp();
    const c = client(app);
    await c.post('/api/auth/login', { email, password: PASSWORD });
    await c.post('/api/email-otp/send');
    const code = lastCode(email)!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await c.post('/api/email-otp/verify', { code: wrong })).body.error.code).toBe('INVALID_CODE');
    expect((await c.post('/api/email-otp/verify', { code })).body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });
});
