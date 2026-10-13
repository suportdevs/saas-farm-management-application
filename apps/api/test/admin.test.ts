import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { issueToken } from '../src/core/tokens';
import { pool } from '../src/db/client';
import { PASSWORD, client, signUp, uniqueEmail } from './helpers';

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

describe('admin', () => {
  it('serves stats and user details to admins only', async () => {
    const admin = await signUp(app, { admin: true });
    const user = await signUp(app);

    const stats = await admin.c.get('/api/admin/stats');
    expect(stats.status).toBe(200);
    expect(stats.body.users.total).toBeGreaterThanOrEqual(2);
    expect(stats.body.signups).toHaveLength(30);

    const detail = await admin.c.get(`/api/admin/users/${user.id}`);
    expect(detail.body.user).toMatchObject({ id: user.id, bannedAt: null });
    expect(detail.body.sessions.length).toBeGreaterThan(0);

    expect((await user.c.get('/api/admin/stats')).status).toBe(403);
    expect((await admin.c.get('/api/admin/users/not-a-uuid')).status).toBe(404);
  });

  it('filters the user list', async () => {
    const admin = await signUp(app, { admin: true });
    const res = await admin.c.get('/api/admin/users?role=admin&pageSize=100');
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThan(0);
    expect(res.body.users.every((u: { role: string }) => u.role === 'admin')).toBe(true);
  });

  it("updates roles but never the admin's own", async () => {
    const admin = await signUp(app, { admin: true });
    const user = await signUp(app);
    const res = await admin.c.patch(`/api/admin/users/${user.id}`, { role: 'admin', emailVerified: true });
    expect(res.body.user).toMatchObject({ role: 'admin', emailVerified: true });
    const self = await admin.c.patch(`/api/admin/users/${admin.id}`, { role: 'user' });
    expect(self.status).toBe(400);
  });

  it('suspends a user: sessions revoked and sign-in blocked until unbanned', async () => {
    const admin = await signUp(app, { admin: true });
    const user = await signUp(app);

    const ban = await admin.c.post(`/api/admin/users/${user.id}/ban`, { reason: 'Spam' });
    expect(ban.body.user.bannedReason).toBe('Spam');
    expect((await user.c.get('/api/auth/me')).status).toBe(401);

    const login = await client(app).post('/api/auth/login', { email: user.email, password: PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_SUSPENDED');

    await admin.c.post(`/api/admin/users/${user.id}/unban`);
    expect((await client(app).post('/api/auth/login', { email: user.email, password: PASSWORD })).status).toBe(200);

    expect((await admin.c.post(`/api/admin/users/${admin.id}/ban`, {})).status).toBe(400);
  });

  it('impersonates a user and restores the admin session afterwards', async () => {
    const admin = await signUp(app, { admin: true, name: 'Ada Admin' });
    const user = await signUp(app, { name: 'Ivy User' });

    expect((await admin.c.post(`/api/admin/users/${user.id}/impersonate`)).status).toBe(200);
    const session = await admin.c.get('/api/auth/session');
    expect(session.body.user.id).toBe(user.id);
    expect(session.body.impersonator).toMatchObject({ id: admin.id });

    // Sensitive actions are blocked while impersonating.
    const pw = await admin.c.post('/api/users/me/password', { currentPassword: PASSWORD, newPassword: 'NewPassw0rd!' });
    expect(pw.body.error.code).toBe('IMPERSONATION_RESTRICTED');
    // Impersonation sessions are hidden from the user's own session list.
    const own = await user.c.get('/api/auth/sessions');
    expect(own.body.sessions).toHaveLength(1);

    const stop = await admin.c.post('/api/auth/impersonation/stop');
    expect(stop.body).toMatchObject({ restored: true });
    expect((await admin.c.get('/api/auth/me')).body.user.id).toBe(admin.id);

    // Admins can't be impersonated.
    const other = await signUp(app, { admin: true });
    expect((await admin.c.post(`/api/admin/users/${other.id}/impersonate`)).status).toBe(403);
  });

  it('records an audit trail', async () => {
    const admin = await signUp(app, { admin: true });
    const user = await signUp(app);
    await user.c.patch('/api/users/me', { name: 'Renamed' });

    const own = await user.c.get('/api/users/me/activity');
    expect(own.body.events.map((e: { action: string }) => e.action)).toContain('user.profile_updated');

    await admin.c.post(`/api/admin/users/${user.id}/ban`, {});
    const logs = await admin.c.get(`/api/admin/audit-logs?userId=${user.id}`);
    const actions = logs.body.events.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.register', 'auth.login', 'admin.user.banned']));
    const banned = logs.body.events.find((e: { action: string }) => e.action === 'admin.user.banned');
    expect(banned.actor.id).toBe(admin.id);
  });

  it('deletes users', async () => {
    const admin = await signUp(app, { admin: true });
    const user = await signUp(app);
    expect((await admin.c.delete(`/api/admin/users/${user.id}`)).status).toBe(204);
    expect((await admin.c.get(`/api/admin/users/${user.id}`)).status).toBe(404);
    expect((await admin.c.delete(`/api/admin/users/${admin.id}`)).status).toBe(400);
  });
});

describe('email change', () => {
  it('requires the password and a confirmed link', async () => {
    const user = await signUp(app);
    const newEmail = uniqueEmail('changed');

    const bad = await user.c.post('/api/users/me/email', { newEmail, password: 'wrong' });
    expect(bad.body.error.code).toBe('INVALID_PASSWORD');
    const ok = await user.c.post('/api/users/me/email', { newEmail, password: PASSWORD });
    expect(ok.status).toBe(200);

    // The real token only exists in the email; issue a fresh one for the test.
    const token = await issueToken(user.id, 'email_change', 60_000, { email: newEmail });
    const confirm = await client(app).post('/api/auth/confirm-email-change', { token });
    expect(confirm.body).toMatchObject({ ok: true, email: newEmail });
    expect((await user.c.get('/api/auth/me')).body.user).toMatchObject({ email: newEmail, emailVerified: true });

    const reused = await client(app).post('/api/auth/confirm-email-change', { token });
    expect(reused.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects addresses that are already taken', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const res = await a.c.post('/api/users/me/email', { newEmail: b.email, password: PASSWORD });
    expect(res.status).toBe(409);
  });
});

describe('health', () => {
  it('exposes liveness and readiness probes with request ids', async () => {
    const live = await client(app).get('/api/health/live');
    expect(live.status).toBe(200);
    expect(live.headers['x-request-id']).toBeTruthy();
    const ready = await client(app).get('/api/health').set('x-request-id', 'abc-123');
    expect(ready.body.status).toBe('ok');
    expect(ready.headers['x-request-id']).toBe('abc-123');
  });
});
