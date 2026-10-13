import type { Express } from 'express';
import type Stripe from 'stripe';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
  process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_monthly';
  process.env.STRIPE_PRICE_TEAM_MONTHLY = '';
});

import { createApp } from '../src/app';
import { db, pool } from '../src/db/client';
import { jobs } from '../src/db/schema';
import { stripe } from '../src/modules/billing/config';
import { billingCustomers, billingEvents } from '../src/modules/billing/schema';
import { applySubscription } from '../src/modules/billing/service';
import { signUp } from './helpers';

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

function signedWebhook(event: object) {
  const payload = JSON.stringify(event);
  const signature = stripe().webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
  return request(app)
    .post('/api/billing/webhook')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signature)
    .send(payload);
}

describe('billing', () => {
  it('lists plans without leaking Stripe price ids', async () => {
    const res = await request(app).get('/api/billing/plans');
    expect(res.status).toBe(200);
    expect(res.body.plans.map((p: { id: string }) => p.id)).toEqual(['free', 'pro', 'team']);
    const pro = res.body.plans.find((p: { id: string }) => p.id === 'pro');
    expect(pro.prices.month).toEqual({ amount: 1900, available: true });
    expect(JSON.stringify(res.body)).not.toContain('price_pro_monthly');
  });

  it('starts users on the free plan and rejects unavailable plans', async () => {
    const { c } = await signUp(app);
    expect((await c.get('/api/auth/me')).body.user).toMatchObject({ plan: 'free', planName: 'Free' });
    const res = await c.post('/api/billing/checkout', { planId: 'team', interval: 'month' });
    expect(res.body.error.code).toBe('PLAN_UNAVAILABLE');
  });

  it('rejects webhooks with a bad signature (no CSRF header needed)', async () => {
    const res = await request(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 't=1,v1=bad')
      .send('{"id":"evt_x"}');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
  });

  it('accepts signed webhooks once and queues a sync', async () => {
    const subscriptionId = `sub_webhook_${Date.now()}`;
    const event = {
      id: `evt_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.updated',
      data: { object: { id: subscriptionId, object: 'subscription' } },
    };
    expect((await signedWebhook(event)).status).toBe(200);
    expect((await signedWebhook(event)).status).toBe(200); // duplicate delivery

    const recorded = await db.select().from(billingEvents).where(eq(billingEvents.id, event.id));
    expect(recorded).toHaveLength(1);
    const queued = await db.select().from(jobs).where(eq(jobs.name, 'billing.sync-subscription'));
    expect(queued.filter((j) => (j.payload as { subscriptionId: string }).subscriptionId === subscriptionId)).toHaveLength(1);
  });

  it('maps a Stripe subscription onto the user plan', async () => {
    const { c, id } = await signUp(app);
    const customerId = `cus_${Date.now()}`;
    await db.insert(billingCustomers).values({ userId: id, stripeCustomerId: customerId });

    const sub = {
      id: `sub_${Date.now()}`,
      customer: customerId,
      status: 'active',
      cancel_at_period_end: false,
      trial_end: null,
      metadata: {},
      items: {
        data: [{ price: { id: 'price_pro_monthly', recurring: { interval: 'month' } }, current_period_end: 1_900_000_000 }],
      },
    } as unknown as Stripe.Subscription;
    await applySubscription(sub);

    expect((await c.get('/api/auth/me')).body.user.plan).toBe('pro');
    const res = await c.get('/api/billing/subscription');
    expect(res.body).toMatchObject({ plan: { id: 'pro' }, subscription: { status: 'active', interval: 'month' } });

    await applySubscription({ ...sub, status: 'canceled' } as Stripe.Subscription);
    expect((await c.get('/api/auth/me')).body.user.plan).toBe('free');
  });
});
