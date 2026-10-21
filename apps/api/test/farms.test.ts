import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, ROLE_PERMISSIONS } from '@kit/shared';
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
    expect(ctx.body.membership.permissions).toEqual([...ROLE_PERMISSIONS.worker]);
    expect(ctx.body.membership.permissions).toContain('herd.create');
    expect(ctx.body.membership.permissions).not.toContain('herd.delete');

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

describe('farm permissions', () => {
  it('lets owners change what a role can do, per action key', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    const base = `/api/farms/${farm.slug}`;
    const sizes = `${base}/products/sizes`;

    expect((await worker.c.post(sizes, { name: 'Small', weight: 1 })).status).toBe(403);

    // Workers may now add (but still not delete) catalog rows, and lose milk.update.
    const wanted = [...ROLE_PERMISSIONS.worker.filter((p) => p !== 'milk.update'), 'products.create'];
    const put = await owner.c.put(`${base}/roles/worker/permissions`, { permissions: wanted });
    expect(put.status).toBe(200);
    expect(put.body.roles.worker.overrides).toEqual({ 'milk.update': false, 'products.create': true });

    const ctx = await worker.c.get(base);
    expect(ctx.body.membership.permissions).toContain('products.create');
    expect(ctx.body.membership.permissions).not.toContain('milk.update');
    expect(ctx.body.rolePermissions.worker).toEqual(ctx.body.membership.permissions);
    expect((await worker.c.get('/api/farms')).body.farms[0].permissions).toEqual(ctx.body.membership.permissions);

    const size = await worker.c.post(sizes, { name: 'Small', weight: 1 });
    expect(size.status).toBe(201);
    expect((await worker.c.delete(`${sizes}/${size.body.key}`)).status).toBe(403);

    // Back to the defaults.
    const reset = await owner.c.delete(`${base}/roles/worker/permissions`);
    expect(reset.body.roles.worker).toEqual({ permissions: [...ROLE_PERMISSIONS.worker], overrides: {} });
    expect((await worker.c.post(sizes, { name: 'Medium', weight: 2 })).status).toBe(403);

    const activity = await owner.c.get(`${base}/activity`);
    expect(activity.body.entries.map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining(['farm.role_permissions_changed', 'farm.role_permissions_reset']),
    );
  });

  it('overrides single action keys for one member', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    const viewer = await inviteAndJoin(app, owner, farm.slug, 'viewer');
    const otherViewer = await inviteAndJoin(app, owner, farm.slug, 'viewer');
    const base = `/api/farms/${farm.slug}`;

    const put = await owner.c.put(`${base}/members/${viewer.id}/permissions`, {
      overrides: { 'products.create': true, 'products.update': true, 'products.export': false },
    });
    expect(put.status).toBe(200);
    const entry = put.body.members.find((m: { userId: string }) => m.userId === viewer.id);
    expect(entry.permissions).toEqual(expect.arrayContaining(['products.view', 'products.create', 'products.update']));
    expect(entry.permissions).not.toContain('products.export');

    const size = await viewer.c.post(`${base}/products/sizes`, { name: 'Small', weight: 1 });
    expect(size.status).toBe(201);
    expect((await viewer.c.put(`${base}/products/sizes/${size.body.key}`, { name: 'Tiny', weight: 1 })).status).toBe(200);
    expect((await viewer.c.delete(`${base}/products/sizes/${size.body.key}`)).status).toBe(403);
    expect((await viewer.c.get(`${base}/products/sizes/export`)).status).toBe(403);
    // Other members of the same role are unaffected.
    expect((await otherViewer.c.post(`${base}/products/sizes`, { name: 'Large', weight: 9 })).status).toBe(403);
    expect((await otherViewer.c.get(`${base}/products/sizes/export`)).status).toBe(200);

    // A member override wins over the farm's role setting.
    await owner.c.put(`${base}/roles/viewer/permissions`, { permissions: [...ROLE_PERMISSIONS.viewer, 'activity.view'] });
    await owner.c.put(`${base}/members/${viewer.id}/permissions`, { overrides: { 'activity.view': false } });
    expect((await viewer.c.get(`${base}/activity`)).status).toBe(403);
    expect((await otherViewer.c.get(`${base}/activity`)).status).toBe(200);

    // Clearing the overrides returns the member to their role.
    await owner.c.put(`${base}/members/${viewer.id}/permissions`, { overrides: {} });
    expect((await viewer.c.get(`${base}/activity`)).status).toBe(200);
    expect((await viewer.c.post(`${base}/products/sizes`, { name: 'Huge', weight: 20 })).status).toBe(403);
  });

  it('lets a farm switch modules off', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    const base = `/api/farms/${farm.slug}`;

    expect((await worker.c.patch(base, { disabledModules: ['products'] })).status).toBe(403);
    const off = await owner.c.patch(base, { disabledModules: ['products', 'milk'] });
    expect(off.status).toBe(200);
    expect(off.body.farm.disabledModules).toEqual(['milk', 'products']);
    expect(off.body.modules).toMatchObject({ products: 'disabled', milk: 'disabled', herd: 'enabled' });
    expect(off.body.membership.permissions.some((p: string) => p.startsWith('products.'))).toBe(false);

    const blocked = await worker.c.get(`${base}/products/sizes`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('MODULE_DISABLED');
    // Core modules can't be switched off.
    expect((await owner.c.patch(base, { disabledModules: ['members'] })).status).toBe(422);

    await owner.c.patch(base, { disabledModules: [] });
    expect((await worker.c.get(`${base}/products/sizes`)).status).toBe(200);
  });

  it('blocks escalation and locked keys', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    const manager = await inviteAndJoin(app, owner, farm.slug, 'manager');
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    const base = `/api/farms/${farm.slug}`;

    // Managers can see the permissions but not change them by default.
    expect((await manager.c.get(`${base}/permissions`)).status).toBe(200);
    expect((await worker.c.get(`${base}/permissions`)).status).toBe(403);
    expect((await manager.c.put(`${base}/members/${worker.id}/permissions`, { overrides: { 'herd.delete': true } })).status).toBe(403);

    // Owners always hold everything; owner-only keys can't be handed out.
    expect((await owner.c.put(`${base}/roles/owner/permissions`, { permissions: [] })).status).toBe(400);
    expect((await owner.c.put(`${base}/members/${owner.id}/permissions`, { overrides: { 'farm.update': false } })).status).toBe(400);
    expect((await owner.c.put(`${base}/members/${worker.id}/permissions`, { overrides: { 'farm.delete': true } })).body.error.code).toBe('OWNER_ONLY_PERMISSION');
    expect((await owner.c.put(`${base}/roles/manager/permissions`, { permissions: PERMISSIONS })).body.error.code).toBe('OWNER_ONLY_PERMISSION');
    expect((await owner.c.put(`${base}/roles/worker/permissions`, { permissions: ['nope.view'] })).status).toBe(422);
    expect((await owner.c.put(`${base}/roles/janitor/permissions`, { permissions: [] })).status).toBe(404);

    // Given roles.manage, a manager may only change keys they hold — and never their own.
    await owner.c.put(`${base}/members/${manager.id}/permissions`, { overrides: { 'roles.manage': true } });
    expect((await manager.c.put(`${base}/members/${worker.id}/permissions`, { overrides: { 'herd.delete': true } })).status).toBe(200);
    const escalate = await manager.c.put(`${base}/members/${worker.id}/permissions`, { overrides: { 'billing.manage': true } });
    expect(escalate.status).toBe(403);
    expect(escalate.body.error.code).toBe('PERMISSION_ESCALATION');
    expect((await manager.c.put(`${base}/members/${manager.id}/permissions`, { overrides: { 'billing.manage': true } })).body.error.code).toBe('SELF_PERMISSION_CHANGE');
    expect((await manager.c.put(`${base}/roles/manager/permissions`, { permissions: [] })).body.error.code).toBe('SELF_PERMISSION_CHANGE');

    // Team actions are separate keys too: deny members.remove, keep members.update.
    await owner.c.put(`${base}/members/${manager.id}/permissions`, { overrides: { 'roles.manage': true, 'members.remove': false } });
    expect((await manager.c.patch(`${base}/members/${worker.id}`, { title: 'Milker' })).status).toBe(204);
    expect((await manager.c.delete(`${base}/members/${worker.id}`)).status).toBe(403);
  });
});
