import { pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** Processed Stripe webhook ids — Stripe may deliver an event more than once. */
export const billingEvents = pgTable('billing_events', {
  id: varchar('id', { length: 100 }).primaryKey(),
  type: text('type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

