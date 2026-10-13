import type { Express } from 'express';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { db, pool } from '../src/db/client';
import { farmSubscriptions } from '../src/modules/subscriptions/schema';
import { createFarm } from './farm-helpers';
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

describe('subscriptions', () => {
  it('applies plan limits once the trial ends', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    await db.update(farmSubscriptions).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(farmSubscriptions.farmId, farm.id));

    const ctx = await owner.c.get(`/api/farms/${farm.slug}`);
    expect(ctx.body.subscription).toMatchObject({ planId: 'free', state: 'free', trialDaysLeft: null });
    expect(ctx.body.limits.members).toBe(2);

    // Starter allows 2 seats: the owner plus one invitation.
    expect((await owner.c.post(`/api/farms/${farm.slug}/invitations`, { email: 'a@example.com' })).status).toBe(201);
    const blocked = await owner.c.post(`/api/farms/${farm.slug}/invitations`, { email: 'b@example.com' });
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.code).toBe('PLAN_LIMIT_REACHED');
    // Re-sending a pending invitation doesn't need a new seat.
    expect((await owner.c.post(`/api/farms/${farm.slug}/invitations`, { email: 'a@example.com' })).status).toBe(201);
  });

  it('serves billing overview without Stripe configured', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    const billing = await owner.c.get(`/api/farms/${farm.slug}/billing`);
    expect(billing.status).toBe(200);
    expect(billing.body.enabled).toBe(false);
    expect(billing.body.plans.map((p: { id: string }) => p.id)).toEqual(['free', 'growth', 'pro', 'enterprise']);
    expect((await owner.c.post(`/api/farms/${farm.slug}/billing/checkout`, { planId: 'pro', interval: 'year' })).status).toBe(400);
  });
});
