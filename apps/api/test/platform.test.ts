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
});
