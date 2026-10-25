import type { Express } from 'express';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { db, pool } from '../src/db/client';
import { users } from '../src/db/schema';
import { createFarm, farmInput, sentInvites } from './farm-helpers';
import { client, PASSWORD, signUp, uniqueEmail } from './helpers';

vi.mock('../src/modules/farms/services/email.service', () => import('./farm-helpers').then((m) => m.farmEmailsMock));

// Capture "your account is ready" emails; every other auth email is sent as usual (to nowhere in tests).
const accountEmails: { to: string; token: string }[] = [];
vi.mock('../src/modules/auth/services/email.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/modules/auth/services/email.service')>()),
  sendAccountCreatedEmail: async (to: string, _name: string, token: string) => {
    accountEmails.push({ to, token });
  },
}));

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

const asStaff = async (staffRole: string) => {
  const staff = await signUp(app, { admin: true });
  await db.update(users).set({ staffRole }).where(eq(users.id, staff.id));
  return staff;
};

describe('platform: manual client flow', () => {
  it('creates a client account that the client activates by setting a password', async () => {
    const staff = await signUp(app, { admin: true });
    const email = uniqueEmail('client');
    const res = await staff.c.post('/api/admin/users', { name: 'Client Person', email });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email, emailVerified: false });
    expect((await staff.c.post('/api/admin/users', { name: 'Again', email })).body.error.code).toBe('EMAIL_TAKEN');

    const { token } = accountEmails.findLast((e) => e.to === email)!;
    const anon = client(app);
    expect((await anon.post('/api/auth/reset-password', { token, password: PASSWORD })).status).toBe(200);
    const login = await anon.post('/api/auth/login', { email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user.emailVerified).toBe(true);
  });

  it('manages a client’s farm team: add, invite, change role, transfer ownership, remove', async () => {
    const staff = await signUp(app, { admin: true });
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    const base = `/api/admin/farms/${farm.id}`;

    // An existing account joins straight away; a new address is invited.
    const manager = await signUp(app);
    expect((await staff.c.post(`${base}/members`, { email: manager.email, role: 'worker' })).body).toEqual({ invited: false, userId: manager.id });
    expect((await staff.c.post(`${base}/members`, { email: manager.email })).body.error.code).toBe('ALREADY_MEMBER');
    const newcomer = uniqueEmail('newcomer');
    expect((await staff.c.post(`${base}/members`, { email: newcomer, role: 'viewer' })).body.invited).toBe(true);

    let team = (await staff.c.get(`${base}/team`)).body;
    expect(team.members.map((m: { userId: string }) => m.userId)).toEqual(expect.arrayContaining([owner.id, manager.id]));
    const invitation = team.invitations.find((i: { email: string }) => i.email === newcomer);
    expect(invitation).toBeDefined();

    // Resending issues a fresh link; revoking removes it.
    const before = sentInvites.filter((i) => i.to === newcomer).length;
    expect((await staff.c.post(`${base}/invitations/${invitation.id}/resend`)).status).toBe(204);
    expect(sentInvites.filter((i) => i.to === newcomer).length).toBe(before + 1);
    expect((await staff.c.delete(`${base}/invitations/${invitation.id}`)).status).toBe(204);

    // Role change, then hand the farm over: the old owner stays as a manager.
    expect((await staff.c.patch(`${base}/members/${manager.id}`, { role: 'manager' })).status).toBe(204);
    expect((await staff.c.post(`${base}/owner`, { userId: manager.id })).status).toBe(204);
    team = (await staff.c.get(`${base}/team`)).body;
    const roleOf = (id: string) => team.members.find((m: { userId: string }) => m.userId === id)?.role;
    expect(roleOf(manager.id)).toBe('owner');
    expect(roleOf(owner.id)).toBe('manager');

    // The last owner stays; anyone else can be removed.
    expect((await staff.c.delete(`${base}/members/${manager.id}`)).body.error.code).toBe('LAST_OWNER');
    expect((await staff.c.delete(`${base}/members/${owner.id}`)).status).toBe(204);
    // …but the old owner still owns the farm's organization, so they keep access until the farm moves.
    expect((await owner.c.get(`/api/farms/${farm.slug}`)).body.membership.role).toBe('owner');
    const newOrg = (await manager.c.post('/api/organizations', { name: 'New Owner Ltd' })).body.organization;
    expect((await staff.c.patch(`${base}/organization`, { organizationId: newOrg.id })).status).toBe(204);
    expect((await owner.c.get(`/api/farms/${farm.slug}`)).status).toBe(404);
    expect((await manager.c.get(`/api/farms/${farm.slug}`)).body.organization).toMatchObject({ id: newOrg.id, role: 'owner' });
  });

  it('keeps team management to staff with platform.tenants.manage', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    const analyst = await asStaff('analyst');
    const support = await asStaff('support');
    expect((await analyst.c.get(`/api/admin/farms/${farm.id}/team`)).status).toBe(200);
    expect((await analyst.c.post(`/api/admin/farms/${farm.id}/members`, { email: uniqueEmail() })).status).toBe(403);
    expect((await support.c.post(`/api/admin/farms/${farm.id}/members`, { email: uniqueEmail(), role: 'viewer' })).status).toBe(201);
  });

  it('ends a manual plan when the platform moves the farm to free', async () => {
    const staff = await signUp(app, { admin: true });
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    await staff.c.patch(`/api/admin/farms/${farm.id}/plan`, { planId: 'growth' });
    expect((await owner.c.get(`/api/farms/${farm.slug}`)).body.subscription).toMatchObject({ planId: 'growth', source: 'manual' });
    await staff.c.patch(`/api/admin/farms/${farm.id}/plan`, { planId: 'free' });
    // Back on the trial (still running), no longer on the manual plan.
    expect((await owner.c.get(`/api/farms/${farm.slug}`)).body.subscription).toMatchObject({ source: null, state: 'trialing' });
  });

  it('lists client organizations and their farms', async () => {
    const staff = await signUp(app, { admin: true });
    const owner = await signUp(app);
    await createFarm(owner.c, 'Directory Farm A');
    await owner.c.post('/api/farms', farmInput('Directory Farm B'));
    const [org] = (await owner.c.get('/api/organizations')).body.organizations;

    const list = await staff.c.get(`/api/admin/organizations?q=${encodeURIComponent(owner.email)}`);
    expect(list.status).toBe(200);
    expect(list.body.organizations).toEqual([expect.objectContaining({ id: org.id, farmCount: 2, owner: expect.objectContaining({ email: owner.email }) })]);

    const farms = await staff.c.get(`/api/admin/farms?organizationId=${org.id}`);
    expect(farms.body.farms.map((f: { name: string }) => f.name).sort()).toEqual(['Directory Farm A', 'Directory Farm B']);
    expect(farms.body.farms[0].organization).toEqual({ id: org.id, name: org.name });
  });
});
