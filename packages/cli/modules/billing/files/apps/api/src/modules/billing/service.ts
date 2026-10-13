import type Stripe from 'stripe';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { AppError, badRequest, db, defineJob, env, logger, users, type User } from '../../core';
import { config, isConfigured, stripe } from './config';
import { findPlan, freePlan, planForPrice, type BillingInterval, type Plan } from './plans';
import { billingCustomers, billingEvents, subscriptions, type Subscription } from './schema';

/** Statuses that grant access to the paid plan. */
export const ENTITLED_STATUSES = ['active', 'trialing', 'past_due'] as const;

export async function getCurrentSubscription(userId: string): Promise<Subscription | undefined> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, [...ENTITLED_STATUSES])))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return row;
}

export async function getUserPlan(userId: string): Promise<Plan> {
  const sub = await getCurrentSubscription(userId);
  return (sub && findPlan(sub.planId)) ?? freePlan;
}

async function getOrCreateCustomer(user: User): Promise<string> {
  const [existing] = await db.select().from(billingCustomers).where(eq(billingCustomers.userId, user.id)).limit(1);
  if (existing) return existing.stripeCustomerId;
  const customer = await stripe().customers.create(
    { email: user.email, name: user.name, metadata: { userId: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  await db.insert(billingCustomers).values({ userId: user.id, stripeCustomerId: customer.id }).onConflictDoNothing();
  return customer.id;
}

export async function createCheckoutSession(user: User, planId: string, interval: BillingInterval): Promise<string> {
  const plan = findPlan(planId);
  const priceId = plan?.prices[interval]?.priceId;
  if (!plan || !priceId) throw badRequest('That plan is not available', 'PLAN_UNAVAILABLE');
  // Existing subscribers change plans in the portal, which handles proration.
  if (await getCurrentSubscription(user.id)) return createPortalSession(user);

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: await getOrCreateCustomer(user),
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { userId: user.id, planId: plan.id },
      ...(config.BILLING_TRIAL_DAYS > 0 ? { trial_period_days: config.BILLING_TRIAL_DAYS } : {}),
    },
    success_url: `${env.WEB_URL}/settings/billing?checkout=success`,
    cancel_url: `${env.WEB_URL}/pricing?checkout=cancelled`,
  });
  if (!session.url) throw new AppError(502, 'CHECKOUT_FAILED', 'Could not start checkout');
  return session.url;
}

export async function createPortalSession(user: User): Promise<string> {
  const [customer] = await db.select().from(billingCustomers).where(eq(billingCustomers.userId, user.id)).limit(1);
  if (!customer) throw badRequest('You have no billing account yet', 'NO_BILLING_ACCOUNT');
  const session = await stripe().billingPortal.sessions.create({
    customer: customer.stripeCustomerId,
    return_url: `${env.WEB_URL}/settings/billing`,
  });
  return session.url;
}

const toDate = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : null);

/** Upserts our copy of a Stripe subscription. */
export async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const [owner] = await db
    .select({ userId: billingCustomers.userId })
    .from(billingCustomers)
    .where(eq(billingCustomers.stripeCustomerId, customerId))
    .limit(1);
  const userId = owner?.userId ?? sub.metadata?.userId;
  if (!userId) {
    logger.warn({ subscription: sub.id, customerId }, 'Ignoring subscription for unknown customer');
    return;
  }
  const exists = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!exists) return; // user deleted since

  const item = sub.items.data[0];
  const priceId = item?.price.id ?? '';
  const match = planForPrice(priceId);
  const values = {
    userId,
    status: sub.status,
    planId: match?.plan.id ?? sub.metadata?.planId ?? 'unknown',
    priceId,
    interval: match?.interval ?? item?.price.recurring?.interval ?? null,
    // Since API version 2025-03-31 the billing period lives on subscription items.
    currentPeriodEnd: toDate(item?.current_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    trialEnd: toDate(sub.trial_end),
  };
  await db.insert(subscriptions).values({ id: sub.id, ...values }).onConflictDoUpdate({ target: subscriptions.id, set: values });
}

/** Re-fetches a subscription so out-of-order webhooks can't leave stale data behind. */
export const syncSubscriptionJob = defineJob<{ subscriptionId: string }>(
  'billing.sync-subscription',
  async ({ subscriptionId }) => {
    await applySubscription(await stripe().subscriptions.retrieve(subscriptionId));
  },
  { maxAttempts: 8 },
);

export function verifyWebhook(rawBody: Buffer | undefined, signature: string | undefined): Stripe.Event {
  if (!isConfigured() || !config.STRIPE_WEBHOOK_SECRET) {
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
  const [fresh] = await db
    .insert(billingEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: billingEvents.id });
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

/** Cancels any live subscriptions immediately — used when an account is deleted. */
export async function cancelAllSubscriptions(userId: string) {
  if (!isConfigured()) return;
  const live = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, [...ENTITLED_STATUSES, 'incomplete', 'unpaid'])));
  for (const sub of live) {
    try {
      await stripe().subscriptions.cancel(sub.id);
    } catch (err) {
      logger.error({ err, subscription: sub.id }, 'Failed to cancel subscription for deleted user');
    }
  }
}
