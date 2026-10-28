import { boolean, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns, users } from '../../../db/schema';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/**
 * Subscription plans, managed by the platform team (Admin → Plans).
 * `id` is the plan code ("free", "pro"…) stored on each farm subscription.
 */
export const plans = pgTable('plans', {
  id: varchar('id', { length: 20 }).primaryKey(),
  name: varchar('name', { length: 60 }).notNull(),
  tagline: varchar('tagline', { length: 160 }).notNull().default(''),
  /** Prices in USD cents; null = no price for that interval. */
  priceMonth: integer('price_month'),
  priceYear: integer('price_year'),
  /** Priced by sales ("Contact us"). */
  custom: boolean('custom').notNull().default(false),
  highlighted: boolean('highlighted').notNull().default(false),
  /** Listed on the pricing page and the farm's billing page. */
  isPublic: boolean('is_public').notNull().default(true),
  /** Can be bought online through Stripe checkout. */
  selfServe: boolean('self_serve').notNull().default(false),
  /** { animals, members } — null = unlimited. */
  limits: jsonb('limits').$type<{ animals: number | null; members: number | null }>().notNull(),
  /** Capability (module) keys the plan includes. */
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
  /** Bullet points shown on the plan card. */
  features: jsonb('features').$type<string[]>().notNull().default([]),
  stripePriceMonth: varchar('stripe_price_month', { length: 100 }),
  stripePriceYear: varchar('stripe_price_year', { length: 100 }),
  /** Archived plans keep their subscribers but can't be chosen any more. */
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  sortOrder: integer('sort_order').notNull().default(0),
  updatedById: uuid('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  // A deleted plan keeps its code: old invoices and subscriptions may still mention it.
  ...auditColumns(),
});

export type PlanRow = typeof plans.$inferSelect;
