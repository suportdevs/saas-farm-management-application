import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { PLAN_LIST, PLANS, type BillingOverview, type FarmInvoice, type PlanId, type PublicPlan } from '@kit/shared';
import { AppError, badRequest, db, defineJob, env, logger, type User } from '../../core';
import { farms, usageOf, type Farm, type Tx } from '../farms';
import { billingEnabled, config, planForPrice, stripe, stripePrices } from './config';
import { ENTITLED_STATUSES, findSubscription, subscriptionOf } from './entitlements';
import { billingEvents, farmSubscriptions, type FarmSubscriptionRow } from './schema';

const DAY = 24 * 60 * 60 * 1000;

// ─── Lifecycle ───────────────────────────────────────────────────

/** Every new farm gets a subscription row, starting the free trial. */
export async function startTrial(farm: Farm, tx: Tx) {
  const trialEndsAt = config.FARM_TRIAL_DAYS > 0 ? new Date(Date.now() + config.FARM_TRIAL_DAYS * DAY) : null;
  await tx.insert(farmSubscriptions).values({ farmId: farm.id, trialEndsAt }).onConflictDoNothing();
}

async function upsert(farmId: string, values: Partial<typeof farmSubscriptions.$inferInsert>) {
  await db
    .insert(farmSubscriptions)
    .values({ farmId, ...values })
    .onConflictDoUpdate({ target: farmSubscriptions.farmId, set: values });
}

/** Adds days to the current trial, or starts one from today. */
export async function extendTrial(farmId: string, days: number) {
  const row = await findSubscription(farmId);
  const from = row?.trialEndsAt && row.trialEndsAt.getTime() > Date.now() ? row.trialEndsAt.getTime() : Date.now();
  const trialEndsAt = new Date(from + days * DAY);
  await upsert(farmId, { trialEndsAt });
  return trialEndsAt;
}

/** Manual (invoiced) plan assignment for enterprise deals and comps. `free` removes a manual plan. */
export async function setManualPlan(farm: Farm, planId: PlanId, currentPeriodEnd: Date | null) {
  const row = await findSubscription(farm.id);
  if (planId === 'free') {
    if (row?.source === 'manual') await upsert(farm.id, { plan: 'free', status: 'canceled', source: null });
    return;
  }
  await cancelFarmSubscription(farm);
  await upsert(farm.id, { plan: planId, status: 'active', source: 'manual', interval: null, cancelAtPeriodEnd: false, currentPeriodEnd });
}

// ─── Catalogue & overview ────────────────────────────────────────

export const publicPlans = (): PublicPlan[] =>
  PLAN_LIST.map((p) => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    prices: p.prices,
    custom: Boolean(p.custom),
    highlighted: Boolean(p.highlighted),
    limits: p.limits,
    features: p.features,
    checkout: {
      month: billingEnabled() && Boolean(stripePrices[p.id]?.month),
      year: billingEnabled() && Boolean(stripePrices[p.id]?.year),
    },
  }));

export async function billingOverview(farm: Farm): Promise<BillingOverview> {
  const row = await findSubscription(farm.id);
  const subscription = subscriptionOf(row);
  return {
    enabled: billingEnabled(),
    subscription,
    usage: await usageOf(farm.id),
    limits: PLANS[subscription.planId].limits,
    plans: publicPlans(),
    hasBillingAccount: Boolean(row?.stripeCustomerId),
  };
}

// ─── Stripe customer, checkout and portal ────────────────────────

async function customerFor(farm: Farm, row: FarmSubscriptionRow | undefined, user: User): Promise<string> {
  if (row?.stripeCustomerId) return row.stripeCustomerId;
  const customer = await stripe().customers.create(
    {
      name: farm.name,
      email: farm.email ?? user.email,
      address: { country: farm.country, city: farm.city ?? undefined, state: farm.region ?? undefined },
      metadata: { farmId: farm.id, createdBy: user.id },
    },
    { idempotencyKey: `farm-customer-${farm.id}` },
  );
  await upsert(farm.id, { stripeCustomerId: customer.id });
  return customer.id;
}

const hasLiveStripeSubscription = (row: FarmSubscriptionRow | undefined) =>
  row?.source === 'stripe' && Boolean(row.stripeSubscriptionId) && ENTITLED_STATUSES.includes(row.status ?? '');

export async function createCheckout(farm: Farm, user: User, planId: 'growth' | 'pro', interval: 'month' | 'year') {
  const priceId = stripePrices[planId]?.[interval];
  if (!priceId) throw badRequest('That plan is not available for online checkout yet', 'PLAN_UNAVAILABLE');
  const row = await findSubscription(farm.id);
  // Existing subscribers switch plans in the portal, which handles proration.
  if (hasLiveStripeSubscription(row)) return createPortal(farm);
  if (subscriptionOf(row).source === 'manual') {
    throw badRequest('This farm is billed by invoice. Contact your account manager to change plans.', 'MANUAL_BILLING');
  }

  // Unused trial days carry over into the paid subscription.
  const trialEnd = row?.trialEndsAt && row.trialEndsAt.getTime() > Date.now() + 2 * DAY ? Math.floor(row.trialEndsAt.getTime() / 1000) : undefined;
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: await customerFor(farm, row, user),
    client_reference_id: farm.id,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    tax_id_collection: { enabled: true },
    customer_update: { name: 'auto', address: 'auto' },
    subscription_data: { metadata: { farmId: farm.id, planId }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
    success_url: `${env.WEB_URL}/farms/${farm.slug}/billing?checkout=success`,
    cancel_url: `${env.WEB_URL}/farms/${farm.slug}/billing?checkout=cancelled`,
  });
  if (!session.url) throw new AppError(502, 'CHECKOUT_FAILED', 'Could not start checkout');
  return session.url;
}

export async function createPortal(farm: Farm): Promise<string> {
  const row = await findSubscription(farm.id);
  if (!row?.stripeCustomerId) throw badRequest('This farm has no billing account yet', 'NO_BILLING_ACCOUNT');
  const session = await stripe().billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${env.WEB_URL}/farms/${farm.slug}/billing`,
  });
  return session.url;
}

export async function listInvoices(farm: Farm): Promise<FarmInvoice[]> {
  const row = await findSubscription(farm.id);
  if (!billingEnabled() || !row?.stripeCustomerId) return [];
  const invoices = await stripe().invoices.list({ customer: row.stripeCustomerId, limit: 24 });
  return invoices.data.map((i) => ({
    id: i.id ?? '',
    number: i.number,
    status: i.status,
    total: i.total,
    currency: i.currency,
    createdAt: new Date(i.created * 1000).toISOString(),
    hostedUrl: i.hosted_invoice_url ?? null,
    pdfUrl: i.invoice_pdf ?? null,
  }));
}

/** Cancels the live Stripe subscription immediately (farm deleted or moved to a manual plan). Never throws. */
export async function cancelFarmSubscription(farm: Farm) {
  const row = await findSubscription(farm.id);
  if (!billingEnabled() || !row?.stripeSubscriptionId || !hasLiveStripeSubscription(row)) return;
  try {
    await stripe().subscriptions.cancel(row.stripeSubscriptionId);
  } catch (err) {
    logger.error({ err, farmId: farm.id }, 'Failed to cancel Stripe subscription');
  }
}

// ─── Webhooks ────────────────────────────────────────────────────

const toDate = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : null);

/** Mirrors a Stripe subscription onto its farm. */
export async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const [byCustomer] = await db.select().from(farmSubscriptions).where(eq(farmSubscriptions.stripeCustomerId, customerId)).limit(1);
  const farmId = byCustomer?.farmId ?? sub.metadata?.farmId;
  const [farm] = farmId ? await db.select({ id: farms.id }).from(farms).where(eq(farms.id, farmId)).limit(1) : [];
  if (!farm) {
    logger.warn({ subscription: sub.id, customerId }, 'Ignoring subscription for unknown farm');
    return;
  }
  const row = byCustomer ?? (await findSubscription(farm.id));
  // An older, replaced subscription must not overwrite the current one.
  if (row?.stripeSubscriptionId && row.stripeSubscriptionId !== sub.id && hasLiveStripeSubscription(row) && !ENTITLED_STATUSES.includes(sub.status)) {
    return;
  }
  const item = sub.items.data[0];
  const match = planForPrice(item?.price.id ?? '');
  await upsert(farm.id, {
    plan: match?.planId ?? sub.metadata?.planId ?? row?.plan ?? 'free',
    status: sub.status,
    source: 'stripe',
    interval: match?.interval ?? item?.price.recurring?.interval ?? null,
    // Since API version 2025-03-31 the billing period lives on subscription items.
    currentPeriodEnd: toDate(item?.current_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: row?.stripeCustomerId ?? customerId,
  });
}

/** Re-fetches the subscription so out-of-order webhooks can't leave stale data. */
export const syncSubscriptionJob = defineJob<{ subscriptionId: string }>(
  'subscriptions.sync',
  async ({ subscriptionId }) => {
    await applySubscription(await stripe().subscriptions.retrieve(subscriptionId));
  },
  { maxAttempts: 8 },
);

export function verifyWebhook(rawBody: Buffer | undefined, signature: string | undefined): Stripe.Event {
  if (!billingEnabled() || !config.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, 'BILLING_NOT_CONFIGURED', 'Billing webhooks are not configured');
  }
  if (!rawBody || !signature) throw badRequest('Missing webhook signature', 'INVALID_SIGNATURE');
  try {
    return stripe().webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw badRequest('Invalid webhook signature', 'INVALID_SIGNATURE');
  }
}

/** Records the event (idempotency) and queues the work. Returns false for duplicates. */
export async function handleEvent(event: Stripe.Event): Promise<boolean> {
  const [fresh] = await db.insert(billingEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning({ id: billingEvents.id });
  if (!fresh) return false;
  switch (event.type) {
    case 'checkout.session.completed': {
      const sub = event.data.object.subscription;
      if (sub) await syncSubscriptionJob.enqueue({ subscriptionId: typeof sub === 'string' ? sub : sub.id });
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      await syncSubscriptionJob.enqueue({ subscriptionId: event.data.object.id });
      break;
    default:
      break;
  }
  return true;
}
