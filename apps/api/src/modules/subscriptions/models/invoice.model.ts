import { date, index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns, users } from '../../../db/schema';
import { farms } from '../../farms/models/farm.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

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
    // Soft-deleted together with its farm. Numbers are never reused.
    ...auditColumns(),
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
    // "Delete payment" (recorded by mistake) soft-deletes it.
    ...auditColumns(),
  },
  (t) => [index('manual_payments_invoice_idx').on(t.invoiceId)],
);

export type ManualInvoiceRow = typeof manualInvoices.$inferSelect;
export type ManualPaymentRow = typeof manualPayments.$inferSelect;
