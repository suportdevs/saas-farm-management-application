import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { pool } from '../src/db/client';
import { createFarm, farmInput, inviteAndJoin, sentInvites } from './farm-helpers';
import { signUp } from './helpers';

// Capture invitation tokens instead of sending email.
vi.mock('../src/modules/farms/emails', () => import('./farm-helpers').then((m) => m.farmEmailsMock));

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

describe('farms', () => {
  it('creates a farm with a trial and owner membership', async () => {
    const owner = await signUp(app);
    const created = await owner.c.post('/api/farms', farmInput());
    expect(created.status).toBe(201);
    expect(created.body.farm).toMatchObject({ country: 'NZ', currency: 'NZD', herdSize: 320, totalArea: 180.5 });
    expect(created.body.farm.slug).toMatch(/^green-valley-dairy/);
    expect(created.body.membership.role).toBe('owner');
    expect(created.body.membership.permissions).toContain('farm.delete');
    expect(created.body.subscription).toMatchObject({ planId: 'pro', state: 'trialing' });
    expect(created.body.subscription.trialDaysLeft).toBe(14);
    expect(created.body.usage).toEqual({ members: 1, animals: 0 });

    const list = await owner.c.get('/api/farms');
    expect(list.body.farms).toHaveLength(1);
    expect(list.body.farms[0]).toMatchObject({ role: 'owner', memberCount: 1 });

    const bySlug = await owner.c.get(`/api/farms/${created.body.farm.slug}`);
    expect(bySlug.body.farm.id).toBe(created.body.farm.id);
  });

  it('validates localisation and hides farms from non-members', async () => {
    const owner = await signUp(app);
    const bad = await owner.c.post('/api/farms', { ...farmInput(), country: 'ZZ', timezone: 'Mars/Base', currency: 'XYZ1' });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.details)).toEqual(expect.arrayContaining(['country', 'timezone', 'currency']));

    const { farm } = await createFarm(owner.c);
    const stranger = await signUp(app);
    expect((await stranger.c.get(`/api/farms/${farm.slug}`)).status).toBe(404);
    expect((await stranger.c.get(`/api/farms/${farm.id}/members`)).status).toBe(404);
  });

  it('enforces role permissions', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    const manager = await inviteAndJoin(app, owner, farm.slug, 'manager');

    const ctx = await worker.c.get(`/api/farms/${farm.slug}`);
    expect(ctx.body.membership.role).toBe('worker');
    expect(ctx.body.membership.permissions).toEqual(['herd.manage', 'milk.manage', 'feed.manage']);

    expect((await worker.c.patch(`/api/farms/${farm.slug}`, { name: 'Hijacked' })).status).toBe(403);
    expect((await worker.c.get(`/api/farms/${farm.slug}/billing`)).status).toBe(403);
    expect((await manager.c.patch(`/api/farms/${farm.slug}`, { name: 'Valley Dairy Co' })).status).toBe(200);
    // Managers run the team but can't hand out ownership or delete the farm.
    expect((await manager.c.post(`/api/farms/${farm.slug}/invitations`, { email: 'x@example.com', role: 'owner' })).status).toBe(403);
    expect((await manager.c.patch(`/api/farms/${farm.slug}/members/${worker.id}`, { role: 'owner' })).status).toBe(403);
    expect((await manager.c.patch(`/api/farms/${farm.slug}/members/${worker.id}`, { role: 'veterinarian', title: 'Vet' })).status).toBe(204);
    expect((await manager.c.delete(`/api/farms/${farm.slug}`, { confirm: 'Valley Dairy Co' })).status).toBe(403);
    expect((await manager.c.patch(`/api/farms/${farm.slug}/members/${manager.id}`, { role: 'worker' })).status).toBe(400);

    const members = await owner.c.get(`/api/farms/${farm.slug}/members`);
    expect(members.body.members.map((m: { role: string }) => m.role)).toEqual(['owner', 'manager', 'veterinarian']);

    const activity = await owner.c.get(`/api/farms/${farm.slug}/activity`);
    expect(activity.body.entries.map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining(['farm.created', 'farm.member_invited', 'farm.member_joined', 'farm.member_role_changed', 'farm.updated']),
    );
    expect((await worker.c.get(`/api/farms/${farm.slug}/activity`)).status).toBe(403);
  });

  it('protects the last owner and lets members leave', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');

    expect((await owner.c.delete(`/api/farms/${farm.slug}/members/${owner.id}`)).status).toBe(400);
    expect((await worker.c.delete(`/api/farms/${farm.slug}/members/${owner.id}`)).status).toBe(403);
    expect((await worker.c.delete(`/api/farms/${farm.slug}/members/${worker.id}`)).status).toBe(204);
    expect((await worker.c.get(`/api/farms/${farm.slug}`)).status).toBe(404);
  });

  it('rejects invitations for another address', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    await owner.c.post(`/api/farms/${farm.slug}/invitations`, { email: 'someone-else@example.com', role: 'viewer' });
    const { token } = sentInvites.findLast((i) => i.to === 'someone-else@example.com')!;

    const lookup = await owner.c.post('/api/farms/invitations/lookup', { token });
    expect(lookup.body.invitation).toMatchObject({ email: 'someone-else@example.com', role: 'viewer', farm: { name: farm.name } });

    const intruder = await signUp(app);
    expect((await intruder.c.post('/api/farms/invitations/accept', { token })).status).toBe(403);
  });

  it('requires the exact farm name to delete', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c, 'Hilltop Beef');
    expect((await owner.c.delete(`/api/farms/${farm.slug}`, { confirm: 'Hilltop' })).status).toBe(400);
    expect((await owner.c.delete(`/api/farms/${farm.slug}`, { confirm: 'hilltop beef' })).status).toBe(204);
    expect((await owner.c.get('/api/farms')).body.farms).toHaveLength(0);
  });

  it('hands farms to the next manager when the owner deletes their account', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    const manager = await inviteAndJoin(app, owner, farm.slug, 'manager');
    expect((await owner.c.delete('/api/users/me', { password: 'Passw0rd!' })).status).toBe(204);
    const ctx = await manager.c.get(`/api/farms/${farm.slug}`);
    expect(ctx.body.membership.role).toBe('owner');
  });
});
