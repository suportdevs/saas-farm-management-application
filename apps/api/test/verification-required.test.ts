import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.EMAIL_VERIFICATION = 'required';
});

import { createApp } from '../src/app';
import { issueToken } from '../src/core/tokens';
import { pool } from '../src/db/client';
import { client, signUp } from './helpers';

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

describe('EMAIL_VERIFICATION=required', () => {
  it('limits unverified users to auth endpoints until they verify', async () => {
    const { c, id } = await signUp(app);
    expect((await c.get('/api/auth/me')).status).toBe(200);
    expect((await c.get('/api/auth/sessions')).status).toBe(200);
    const blocked = await c.patch('/api/users/me', { name: 'Blocked' });
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const token = await issueToken(id, 'email_verification', 60_000);
    await client(app).post('/api/auth/verify-email', { token });
    expect((await c.patch('/api/users/me', { name: 'Allowed' })).status).toBe(200);
  });
});
