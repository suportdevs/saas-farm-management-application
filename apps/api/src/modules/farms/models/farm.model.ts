import { index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../../db/schema';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

export const farmType = pgEnum('farm_type', ['dairy', 'beef', 'mixed', 'breeding', 'calf_rearing']);

/** A farm is the tenant: every piece of operational data belongs to exactly one farm. */
export const farms = pgTable(
  'farms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 60 }).notNull().unique(),
    type: farmType('type').notNull().default('dairy'),
    description: text('description'),

    // Location & localisation
    country: varchar('country', { length: 2 }).notNull(),
    region: varchar('region', { length: 100 }),
    city: varchar('city', { length: 100 }),
    address: varchar('address', { length: 255 }),
    postalCode: varchar('postal_code', { length: 20 }),
    timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    locale: varchar('locale', { length: 35 }).notNull().default('en-US'),
    unitSystem: varchar('unit_system', { length: 10 }).notNull().default('metric'),
    milkUnit: varchar('milk_unit', { length: 5 }).notNull().default('L'),
    weightUnit: varchar('weight_unit', { length: 5 }).notNull().default('kg'),
    areaUnit: varchar('area_unit', { length: 5 }).notNull().default('ha'),

    // Profile
    totalArea: numeric('total_area', { precision: 12, scale: 2, mode: 'number' }),
    herdSize: integer('herd_size'),
    phone: varchar('phone', { length: 40 }),
    email: varchar('email', { length: 254 }),
    website: varchar('website', { length: 255 }),
    registrationNumber: varchar('registration_number', { length: 100 }),
    taxId: varchar('tax_id', { length: 100 }),
    fiscalYearStartMonth: integer('fiscal_year_start_month').notNull().default(1),
    goals: jsonb('goals').$type<string[]>().notNull().default([]),
    /** Business modules the farm switched off (see TOGGLEABLE_MODULES). */
    disabledModules: jsonb('disabled_modules').$type<string[]>().notNull().default([]),

    // Platform admin can suspend a tenant (e.g. fraud, unpaid invoices).
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedReason: varchar('suspended_reason', { length: 500 }),

    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('farms_created_at_idx').on(t.createdAt), index('farms_country_idx').on(t.country)],
);

export type Farm = typeof farms.$inferSelect;
