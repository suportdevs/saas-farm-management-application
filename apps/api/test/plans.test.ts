import type { Express } from 'express';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { db, pool } from '../src/db/client';
import { users } from '../src/db/schema';
import { farmSubscriptions, plans } from '../src/modules/subscriptions/models';
import { createFarm } from './farm-helpers';
import { signUp, uniqueEmail } from './helpers';

vi.mock('../src/modules/farms/services/email.service', () => import('./farm-helpers').then((m) => m.farmEmailsMock));

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

/** A unique plan code per test run (codes are global). */
const code = (tag: string) => `${tag}${Date.now().toString(36).slice(-6)}`;

const planInput = (id: string) => ({
  id,
  name: 'Co-op',
  tagline: 'For co-operatives',
  prices: { month: 4900, year: '' },
  limits: { animals: 500, members: '' },
  capabilities: ['herd', 'milk', 'products'],
  features: ['500 animals', 'Unlimited team'],
});

describe('plans', () => {
  it('lists the public plans without signing in', async () => {
    const res = await request(app).get('/api/billing/plans');
    expect(res.status).toBe(200);
    const ids = res.body.plans.map((p: { id: string }) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['free', 'growth', 'pro', 'enterprise']));
    expect(res.body.plans.find((p: { id: string }) => p.id === 'pro')).toMatchObject({ name: 'Professional', limits: { animals: 2000, members: 50 } });
  });

  it('lets platform staff create, edit, archive and delete plans', async () => {
    const admin = await signUp(app, { admin: true });
    const id = code('coop');

    const created = await admin.c.post('/api/admin/plans', planInput(id));
    expect(created.status).toBe(201);
    expect(created.body.plan).toMatchObject({ id, prices: { month: 4900 }, limits: { animals: 500, members: null }, archived: false });
    expect((await admin.c.post('/api/admin/plans', planInput(id))).status).toBe(409);

    const updated = await admin.c.patch(`/api/admin/plans/${id}`, { name: 'Co-operative', limits: { animals: 800, members: 20 } });
    expect(updated.status).toBe(200);
    // Only the fields sent change.
    expect(updated.body.plan).toMatchObject({ name: 'Co-operative', tagline: 'For co-operatives', limits: { animals: 800, members: 20 }, capabilities: ['herd', 'milk', 'products'] });

    // Public until archived.
    let pub = await request(app).get('/api/billing/plans');
    expect(pub.body.plans.some((p: { id: string }) => p.id === id)).toBe(true);
    expect((await admin.c.post(`/api/admin/plans/${id}/archive`)).body.plan.archived).toBe(true);
    pub = await request(app).get('/api/billing/plans');
    expect(pub.body.plans.some((p: { id: string }) => p.id === id)).toBe(false);
    expect((await admin.c.post(`/api/admin/plans/${id}/restore`)).body.plan.archived).toBe(false);

    expect((await admin.c.delete(`/api/admin/plans/${id}`)).status).toBe(204);
    expect((await admin.c.get(`/api/admin/plans/${id}`)).status).toBe(404);
  });

  it('protects the free and trial plans and plans in use', async () => {
    const admin = await signUp(app, { admin: true });
    expect((await admin.c.post('/api/admin/plans/free/archive')).body.error.code).toBe('PLAN_LOCKED');
    expect((await admin.c.post('/api/admin/plans/pro/archive')).body.error.code).toBe('PLAN_LOCKED');
    expect((await admin.c.patch('/api/admin/plans/free', { prices: { month: 100 } })).body.error.code).toBe('FREE_PLAN_LOCKED');
    expect((await admin.c.patch('/api/admin/plans/growth', { selfServe: true, prices: { month: null, year: null } })).body.error.code).toBe('PRICE_REQUIRED');
    expect((await admin.c.delete('/api/admin/plans/growth')).status).toBe(409);
  });

  it('gives farms on a plan its limits and modules, including after an edit', async () => {
    const admin = await signUp(app, { admin: true });
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    const id = code('small');
    expect((await admin.c.post('/api/admin/plans', { ...planInput(id), limits: { animals: 50, members: 3 }, capabilities: ['herd'] })).status).toBe(201);

    // A manual plan assignment uses the database plan.
    expect((await admin.c.patch(`/api/admin/farms/${farm.id}/plan`, { planId: id })).status).toBe(204);
    let ctx = await owner.c.get(`/api/farms/${farm.slug}`);
    expect(ctx.body.subscription).toMatchObject({ planId: id, planName: 'Co-op', state: 'active' });
    expect(ctx.body.limits).toEqual({ animals: 50, members: 3 });
    expect(ctx.body.modules).toMatchObject({ herd: 'enabled', products: 'plan', finance: 'plan' });

    // Editing the plan applies to its farms at once.
    await admin.c.patch(`/api/admin/plans/${id}`, { capabilities: ['herd', 'products'], limits: { animals: 60, members: 4 } });
    ctx = await owner.c.get(`/api/farms/${farm.slug}`);
    expect(ctx.body.limits).toEqual({ animals: 60, members: 4 });
    expect(ctx.body.modules.products).toBe('enabled');

    // Archived plans stay with their farms but can't be given to new ones.
    await admin.c.post(`/api/admin/plans/${id}/archive`);
    expect((await owner.c.get(`/api/farms/${farm.slug}`)).body.subscription.planId).toBe(id);
    const other = await createFarm(owner.c, 'Second Farm');
    const refused = await admin.c.patch(`/api/admin/farms/${other.farm.id}/plan`, { planId: id });
    expect(refused.body.error.code).toBe('PLAN_ARCHIVED');
    expect((await admin.c.patch(`/api/admin/farms/${farm.id}/plan`, { planId: id })).status).toBe(204);
    expect((await admin.c.patch(`/api/admin/farms/${farm.id}/plan`, { planId: 'nope' })).body.error.code).toBe('UNKNOWN_PLAN');

    // Clean up so the plan code isn't left referenced.
    await db.update(farmSubscriptions).set({ plan: 'free', source: null }).where(eq(farmSubscriptions.plan, id));
    await db.delete(plans).where(eq(plans.id, id));
  });

  it('keeps plan management to staff with platform.plans.manage', async () => {
    const analyst = await signUp(app, { admin: true });
    await db.update(users).set({ staffRole: 'analyst' }).where(eq(users.id, analyst.id));
    expect((await analyst.c.get('/api/admin/plans')).status).toBe(200);
    expect((await analyst.c.post('/api/admin/plans', planInput(code('x')))).status).toBe(403);

    const customer = await signUp(app, { email: uniqueEmail('customer') });
    expect((await customer.c.get('/api/admin/plans')).status).not.toBe(200);
  });
});
