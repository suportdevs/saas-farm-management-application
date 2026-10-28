import { boolean, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../../../db/schema';
import { farms } from '../../farms/models/farm.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/**
 * One row per farm. `plan` is what the farm pays for; the plan in effect is
 * derived in services/entitlement.service.ts (trial and expiry applied).
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
  /** Per-tenant deals on top of the plan: limit overrides (null = unlimited) … */
  limitOverrides: jsonb('limit_overrides').$type<Record<string, number | null>>().notNull().default({}),
  /** … and modules added (true) or removed (false). */
  capabilityOverrides: jsonb('capability_overrides').$type<Record<string, boolean>>().notNull().default({}),
  /** Internal notes about the deal (contract number, contact…). */
  dealNotes: text('deal_notes'),
  // Soft-deleted together with its farm.
  ...auditColumns(),
});

export type FarmSubscriptionRow = typeof farmSubscriptions.$inferSelect;
