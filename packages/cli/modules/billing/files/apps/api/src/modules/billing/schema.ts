import { boolean, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../db/schema';

/** Links a user to their Stripe customer. */
export const billingCustomers = pgTable('billing_customers', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  stripeCustomerId: varchar('stripe_customer_id', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Local mirror of Stripe subscriptions, kept in sync by webhooks. */
export const subscriptions = pgTable(
  'subscriptions',
  {
    // Stripe subscription id (sub_…)
    id: varchar('id', { length: 100 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 30 }).notNull(),
    planId: varchar('plan_id', { length: 50 }).notNull(),
    priceId: varchar('price_id', { length: 100 }).notNull(),
    interval: varchar('interval', { length: 10 }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    trialEnd: timestamp('trial_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('subscriptions_user_id_idx').on(t.userId)],
);

/** Processed webhook event ids — Stripe may deliver the same event more than once. */
export const billingEvents = pgTable('billing_events', {
  id: varchar('id', { length: 100 }).primaryKey(),
  type: text('type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Subscription = typeof subscriptions.$inferSelect;
