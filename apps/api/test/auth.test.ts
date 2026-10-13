import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { pool } from '../src/db/client';
import { client as makeClient } from './helpers';

let app: Express;
const email = `test-${Date.now()}@example.com`;
const password = 'Passw0rd!';

beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

const client = () => makeClient(app);

describe('auth', () => {
  it('reports health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects state-changing requests without the CSRF header', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_CHECK_FAILED');
  });

  it('validates registration input', async () => {
    const res = await client().post('/api/auth/register', { name: 'A', email: 'nope', password: 'short' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.details)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('registers, reads the session, and logs out', async () => {
    const c = client();
    const reg = await c.post('/api/auth/register', { name: 'Test User', email, password });
    expect(reg.status).toBe(201);
    expect(reg.body.user).toMatchObject({ email, name: 'Test User', emailVerified: false });
    expect(reg.headers['set-cookie']?.[0]).toMatch(/HttpOnly/);
    expect(reg.body.user).not.toHaveProperty('passwordHash');

    const me = await c.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);

    expect((await c.post('/api/auth/logout')).status).toBe(204);
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  it('rejects duplicate emails (case-insensitive)', async () => {
    const res = await client().post('/api/auth/register', { name: 'Dup', email: email.toUpperCase(), password });
    expect(res.status).toBe(409);
  });

  it('logs in with valid credentials only', async () => {
    const bad = await client().post('/api/auth/login', { email, password: 'wrong' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');

    const c = client();
    const ok = await c.post('/api/auth/login', { email, password });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(email);

    const sessions = await c.get('/api/auth/sessions');
    expect(sessions.body.sessions.some((s: { current: boolean }) => s.current)).toBe(true);
  });

  it('updates the profile and blocks non-admins from admin routes', async () => {
    const c = client();
    await c.post('/api/auth/login', { email, password });
    const res = await c.patch('/api/users/me', { name: 'Renamed' });
    expect(res.body.user.name).toBe('Renamed');
    expect((await c.get('/api/admin/users')).status).toBe(403);
  });

  it('does not reveal whether an email exists on forgot-password', async () => {
    const a = await client().post('/api/auth/forgot-password', { email });
    const b = await client().post('/api/auth/forgot-password', { email: 'missing@example.com' });
    expect(a.status).toBe(200);
    expect(b.body).toEqual(a.body);
  });
});
