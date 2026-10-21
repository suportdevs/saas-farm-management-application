import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { pool } from '../src/db/client';
import { createFarm } from './farm-helpers';
import { signUp } from './helpers';

// Capture invitation tokens instead of sending email.
vi.mock('../src/modules/farms/emails', () => import('./farm-helpers').then((m) => m.farmEmailsMock));
vi.mock('../src/modules/platform/emails', () => ({ sendFarmSuspendedEmail: async () => {} }));

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

describe('platform admin', () => {
  it('lists farms, assigns plans and suspends tenants', async () => {
    const admin = await signUp(app, { admin: true });
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c, `Admin Test Ranch ${Date.now()}`);

    expect((await owner.c.get('/api/admin/farms')).status).toBe(403);

    const list = await admin.c.get(`/api/admin/farms?q=${encodeURIComponent(farm.name)}`);
    expect(list.status).toBe(200);
    expect(list.body.farms).toHaveLength(1);
    expect(list.body.farms[0]).toMatchObject({ id: farm.id, memberCount: 1, owner: { email: owner.email } });

    expect((await admin.c.patch(`/api/admin/farms/${farm.id}/plan`, { planId: 'enterprise' })).status).toBe(204);
    const ctx = await owner.c.get(`/api/farms/${farm.slug}`);
    expect(ctx.body.subscription).toMatchObject({ planId: 'enterprise', state: 'active', source: 'manual' });
    expect(ctx.body.limits).toEqual({ animals: null, members: null });

    const stats = await admin.c.get('/api/admin/farms/stats');
    expect(stats.status).toBe(200);
    expect(stats.body.farms.paying).toBeGreaterThanOrEqual(1);
    expect(stats.body.created).toHaveLength(30);

    expect((await admin.c.post(`/api/admin/farms/${farm.id}/suspend`, { reason: 'Unpaid invoice' })).status).toBe(204);
    const suspended = await owner.c.get(`/api/farms/${farm.slug}/members`);
    expect(suspended.status).toBe(403);
    expect(suspended.body.error.code).toBe('FARM_SUSPENDED');
    // The workspace itself still loads so the UI can explain what happened.
    expect((await owner.c.get(`/api/farms/${farm.slug}`)).body.farm.suspendedReason).toBe('Unpaid invoice');

    expect((await admin.c.post(`/api/admin/farms/${farm.id}/unsuspend`)).status).toBe(204);
    expect((await owner.c.get(`/api/farms/${farm.slug}/members`)).status).toBe(200);
  });

  it('scopes platform staff by staff role, per action', async () => {
    const superAdmin = await signUp(app, { admin: true });
    const staff = await signUp(app, { admin: true });
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c, `Staff Test Ranch ${Date.now()}`);
    const asRole = (staffRole: string | null) => superAdmin.c.patch(`/api/admin/users/${staff.id}`, { staffRole });

    // Admins without a staff role are super admins.
    const session = await superAdmin.c.get('/api/auth/session');
    expect(session.body.user.staffRole).toBe('super_admin');
    expect(session.body.user.platformPermissions).toContain('platform.staff.manage');

    expect((await asRole('analyst')).status).toBe(200);
    expect((await staff.c.get('/api/admin/farms')).status).toBe(200);
    expect((await staff.c.get('/api/admin/users')).status).toBe(200);
    const denied = await staff.c.post(`/api/admin/farms/${farm.id}/suspend`, { reason: 'test' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PLATFORM_PERMISSION_REQUIRED');
    expect((await staff.c.get('/api/admin/audit-logs')).status).toBe(403);

    await asRole('billing');
    expect((await staff.c.patch(`/api/admin/farms/${farm.id}/plan`, { planId: 'growth' })).status).toBe(204);
    expect((await staff.c.post(`/api/admin/farms/${farm.id}/trial`, { days: 7 })).status).toBe(204);
    expect((await staff.c.post(`/api/admin/farms/${farm.id}/suspend`, {})).status).toBe(403);

    await asRole('support');
    expect((await staff.c.post(`/api/admin/farms/${farm.id}/suspend`, {})).status).toBe(204);
    expect((await staff.c.post(`/api/admin/farms/${farm.id}/unsuspend`)).status).toBe(204);
    expect((await staff.c.delete(`/api/admin/farms/${farm.id}`)).status).toBe(403);
    // Only super admins manage staff.
    expect((await staff.c.patch(`/api/admin/users/${owner.id}`, { role: 'admin' })).status).toBe(403);
    expect((await staff.c.patch(`/api/admin/users/${owner.id}`, { name: 'Renamed Owner' })).status).toBe(200);
    expect((await superAdmin.c.patch(`/api/admin/users/${owner.id}`, { staffRole: 'support' })).body.error.code).toBe('NOT_STAFF');

    // Demoting to user clears the staff role.
    await superAdmin.c.patch(`/api/admin/users/${staff.id}`, { role: 'user' });
    expect((await staff.c.get('/api/admin/farms')).status).toBe(403);
  });

  it('creates, assigns, updates and deletes custom staff roles', async () => {
    const superAdmin = await signUp(app, { admin: true });
    const staff = await signUp(app, { admin: true });
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c, `Role Test Ranch ${Date.now()}`);
    const key = `ops-${Date.now()}`;

    const list = await superAdmin.c.get('/api/admin/staff-roles');
    expect(list.status).toBe(200);
    expect(list.body.roles.filter((r: { system: boolean }) => r.system).map((r: { key: string }) => r.key)).toEqual([
      'super_admin',
      'support',
      'billing',
      'analyst',
    ]);
    expect((await superAdmin.c.patch('/api/admin/staff-roles/support', { name: 'Hacked' })).body.error.code).toBe('SYSTEM_ROLE');

    const created = await superAdmin.c.post('/api/admin/staff-roles', {
      key,
      name: 'Tenant ops',
      permissions: ['platform.tenants.view', 'platform.tenants.suspend'],
    });
    expect(created.status).toBe(201);
    expect(created.body.role).toMatchObject({ key, system: false, userCount: 0, permissions: ['platform.tenants.view', 'platform.tenants.suspend'] });
    expect((await superAdmin.c.post('/api/admin/staff-roles', { key, name: 'Again' })).body.error.code).toBe('ROLE_KEY_TAKEN');
    // The key defaults to a slug of the name.
    const slugged = await superAdmin.c.post('/api/admin/staff-roles', { name: `Read Only ${Date.now()}` });
    expect(slugged.body.role.key).toMatch(/^read-only-\d+$/);

    expect((await superAdmin.c.patch(`/api/admin/users/${staff.id}`, { staffRole: key })).status).toBe(200);
    const session = await staff.c.get('/api/auth/session');
    expect(session.body.user).toMatchObject({ staffRole: key, staffRoleName: 'Tenant ops', platformPermissions: ['platform.tenants.view', 'platform.tenants.suspend'] });
    expect((await staff.c.post(`/api/admin/farms/${farm.id}/suspend`, {})).status).toBe(204);
    expect((await staff.c.get('/api/admin/users')).status).toBe(403);
    expect((await superAdmin.c.patch(`/api/admin/users/${staff.id}`, { staffRole: 'no-such-role' })).body.error.code).toBe('UNKNOWN_STAFF_ROLE');

    // Editing the role takes effect immediately.
    await superAdmin.c.patch(`/api/admin/staff-roles/${key}`, { permissions: ['platform.tenants.view'] });
    expect((await staff.c.post(`/api/admin/farms/${farm.id}/unsuspend`)).status).toBe(403);
    expect((await superAdmin.c.get(`/api/admin/staff-roles/${key}`)).body.role.userCount).toBe(1);

    expect((await superAdmin.c.delete(`/api/admin/staff-roles/${key}`)).body.error.code).toBe('ROLE_IN_USE');
    await superAdmin.c.patch(`/api/admin/users/${staff.id}`, { staffRole: 'analyst' });
    expect((await superAdmin.c.delete(`/api/admin/staff-roles/${key}`)).status).toBe(204);
    expect((await staff.c.get('/api/admin/staff-roles')).status).toBe(403);
  });

  it('makes new staff analysts and stops staff appointing more powerful staff', async () => {
    const superAdmin = await signUp(app, { admin: true });
    const user = await signUp(app);
    const other = await signUp(app);
    expect((await superAdmin.c.patch(`/api/admin/users/${user.id}`, { role: 'admin' })).body.user).toMatchObject({ role: 'admin', staffRole: 'analyst' });

    // A custom role with staff.manage but not billing can't appoint billing staff or super admins.
    const key = `hr-${Date.now()}`;
    await superAdmin.c.post('/api/admin/staff-roles', { key, name: 'Staff HR', permissions: ['platform.users.view', 'platform.users.update', 'platform.staff.manage'] });
    await superAdmin.c.patch(`/api/admin/users/${user.id}`, { staffRole: key });
    expect((await user.c.patch(`/api/admin/users/${other.id}`, { role: 'admin', staffRole: 'billing' })).body.error.code).toBe('PERMISSION_ESCALATION');
    expect((await user.c.patch(`/api/admin/users/${other.id}`, { role: 'admin', staffRole: 'super_admin' })).body.error.code).toBe('PERMISSION_ESCALATION');
    expect((await user.c.patch(`/api/admin/users/${superAdmin.id}`, { role: 'user' })).body.error.code).toBe('PERMISSION_ESCALATION');
    expect((await user.c.post('/api/admin/staff-roles', { name: 'Billing twin', permissions: ['platform.billing.manage'] })).body.error.code).toBe('PERMISSION_ESCALATION');
    expect((await user.c.patch(`/api/admin/staff-roles/${key}`, { permissions: ['platform.users.view'] })).body.error.code).toBe('SELF_ACTION');
  });
});
