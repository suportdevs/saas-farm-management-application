import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../db/schema';
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
  /** Per-tenant deals on top of the plan: limit overrides (null = unlimited) … */
  limitOverrides: jsonb('limit_overrides').$type<Record<string, number | null>>().notNull().default({}),
  /** … and modules added (true) or removed (false). */
  capabilityOverrides: jsonb('capability_overrides').$type<Record<string, boolean>>().notNull().default({}),
  /** Internal notes about the deal (contract number, contact…). */
  dealNotes: text('deal_notes'),
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

/**
 * Invoices the platform team issues by hand (bank transfer, cash…), outside
 * Stripe. Paid in full → the tenant's manual plan can be extended automatically.
 */
export const manualInvoices = pgTable(
  'manual_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    farmId: uuid('farm_id')
      .notNull()
      .references(() => farms.id, { onDelete: 'cascade' }),
    /** INV-2026-00001 — sequential per year. */
    number: varchar('number', { length: 30 }).notNull().unique(),
    description: varchar('description', { length: 255 }).notNull(),
    /** Minor units (cents). */
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    issuedAt: date('issued_at').notNull(),
    dueAt: date('due_at').notNull(),
    /** On full payment the tenant moves to this plan, paid through `periodEnd`. */
    planId: varchar('plan_id', { length: 20 }),
    periodEnd: date('period_end'),
    notes: text('notes'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('manual_invoices_farm_idx').on(t.farmId), index('manual_invoices_due_idx').on(t.dueAt)],
);

/** Payments recorded against a manual invoice (several = paid in instalments). */
export const manualPayments = pgTable(
  'manual_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => manualInvoices.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    method: varchar('method', { length: 20 }).notNull(),
    reference: varchar('reference', { length: 120 }),
    paidAt: date('paid_at').notNull(),
    notes: text('notes'),
    recordedById: uuid('recorded_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('manual_payments_invoice_idx').on(t.invoiceId)],
);

export type FarmSubscriptionRow = typeof farmSubscriptions.$inferSelect;
export type ManualInvoiceRow = typeof manualInvoices.$inferSelect;
export type ManualPaymentRow = typeof manualPayments.$inferSelect;
