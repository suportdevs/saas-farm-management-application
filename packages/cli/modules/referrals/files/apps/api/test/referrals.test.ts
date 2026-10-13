import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/client';
import { PASSWORD, signUp, uniqueEmail } from './helpers';

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

const registerWithCookie = (cookie: string, name: string) =>
  request(app)
    .post('/api/auth/register')
    .set('X-Requested-With', 'test')
    .set('Cookie', cookie)
    .send({ name, email: uniqueEmail('inv'), password: PASSWORD });

describe('referrals', () => {
  it('gives every user a stable invitation link', async () => {
    const { c } = await signUp(app);
    const a = await c.get('/api/referrals/me');
    expect(a.body.code).toMatch(/^[a-z2-9]{8}$/);
    expect(a.body.url).toBe(`http://localhost:3000/register?ref=${a.body.code}`);
    expect((await c.get('/api/referrals/me')).body.code).toBe(a.body.code);
  });

  it('credits sign-ups that arrive with the referral cookie', async () => {
    const referrer = await signUp(app, { name: 'Rita Referrer' });
    const { code } = (await referrer.c.get('/api/referrals/me')).body;

    const reg = await registerWithCookie(`ref=${code}`, 'Ian Invited');
    expect(reg.status).toBe(201);

    const stats = (await referrer.c.get('/api/referrals/me')).body;
    expect(stats.stats.signups).toBe(1);
    expect(stats.referrals[0]).toMatchObject({ name: 'Ian I.', verified: false });
  });

  it('ignores unknown codes', async () => {
    expect((await registerWithCookie('ref=doesnotexist', 'No Ref')).status).toBe(201);
  });
});
