import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => [] as { to: string; subject: string; text?: string }[]);
vi.mock('../src/lib/mailer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/mailer')>()),
  sendMail: vi.fn(async (m: { to: string; subject: string; text?: string }) => {
    sent.push(m);
  }),
}));

import { createApp } from '../src/app';
import { pool } from '../src/db/client';
import { client, signUp, uniqueEmail } from './helpers';

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

const linkToken = (email: string) => {
  const match = sent.find((m) => m.to === email && /magic-link\?token=/.test(m.text ?? ''))?.text?.match(/magic-link\?token=([^\s&]+)/);
  return match ? decodeURIComponent(match[1]!) : undefined;
};

describe('magic links', () => {
  it('signs an existing user in once and verifies their email', async () => {
    const { email } = await signUp(app);
    expect((await client(app).post('/api/magic-link/request', { email, next: '/settings' })).body).toEqual({ ok: true });
    const token = linkToken(email);
    expect(token).toBeTruthy();

    const c = client(app);
    const res = await c.post('/api/magic-link/verify', { token });
    expect(res.body).toMatchObject({ user: { email, emailVerified: true }, next: '/settings' });
    expect((await c.get('/api/auth/me')).status).toBe(200);

    expect((await client(app).post('/api/magic-link/verify', { token })).body.error.code).toBe('INVALID_TOKEN');
  });

  it('does not reveal or create unknown accounts (sign-up off by default)', async () => {
    const email = uniqueEmail('nobody');
    const res = await client(app).post('/api/magic-link/request', { email });
    expect(res.body).toEqual({ ok: true });
    expect(sent.filter((m) => m.to === email)).toHaveLength(0);
  });

  it('invalidates the previous link when a new one is requested', async () => {
    const { email } = await signUp(app);
    await client(app).post('/api/magic-link/request', { email });
    const first = linkToken(email);
    sent.length = 0;
    await client(app).post('/api/magic-link/request', { email });
    expect((await client(app).post('/api/magic-link/verify', { token: first })).status).toBe(400);
    expect((await client(app).post('/api/magic-link/verify', { token: linkToken(email) })).status).toBe(200);
  });

  it('rejects open redirects', async () => {
    const res = await client(app).post('/api/magic-link/request', { email: uniqueEmail(), next: '//evil.com' });
    expect(res.status).toBe(422);
  });
});
