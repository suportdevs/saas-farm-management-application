import { boolean, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { farms } from '../farms/schema';

// NOTE: keep imports in schema files relative — drizzle-kit loads them directly.

/**
 * One row per farm. `plan` is what the farm pays for; the plan in effect is
 * derived in entitlements.ts (trial and expiry applied).
 */
export const farmSubscriptions = pgTable('farm_subscriptions', {
  farmId: uuid('farm_id')
    .primaryKey()
    .references(() => farms.id, { onDelete: 'cascade' }),
  plan: varchar('plan', { length: 20 }).notNull().default('free'),
  /** Stripe status (active, trialing, past_due, canceled…) or "active" for manual plans. */
  status: varchar('status', { length: 30 }),
  /** "stripe" (self-serve) or "manual" (invoiced by sales). */
  source: varchar('source', { length: 10 }),
  interval: varchar('interval', { length: 10 }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  stripeCustomerId: varchar('stripe_customer_id', { length: 100 }).unique(),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Processed Stripe webhook ids — Stripe may deliver an event more than once. */
export const billingEvents = pgTable('billing_events', {
  id: varchar('id', { length: 100 }).primaryKey(),
  type: text('type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type FarmSubscriptionRow = typeof farmSubscriptions.$inferSelect;
