import { date, index, integer, jsonb, numeric, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { suppliers } from '../../distribution/models/supplier.model';
import { activeUnique, audit, base } from '../../products/models/columns';
import { pens } from './pen.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/**
 * Groups of animals bought, raised and sold together. Animal counts are not
 * stored: they are counted from `animals.batch_id` when listed.
 */
export const batches = pgTable(
  'batches',
  {
    ...base(),
    number: varchar('batch_number', { length: 50 }).notNull(),
    /** Called `name` in code so the catalog engine can show it. */
    name: varchar('batch_name', { length: 255 }),
    arrivalDate: date('arrival_date', { mode: 'string' }).notNull(),
    expectedExitDate: date('expected_exit_date', { mode: 'string' }),
    actualExitDate: date('actual_exit_date', { mode: 'string' }),
    supplierId: integer('supplier_id').references(() => suppliers.id),
    /** active · completed · cancelled (BATCH_STATUSES). */
    status: varchar('status', { length: 20 }).notNull().default('active'),
    targetWeight: numeric('target_weight', { precision: 8, scale: 2, mode: 'number' }),
    targetWeightUnit: varchar('target_weight_unit', { length: 10 }).notNull().default('kg'),
    totalPurchaseCost: numeric('total_purchase_cost', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    totalSaleRevenue: numeric('total_sale_revenue', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    /** calves · heifers · milking · dry · breeding · fattening · other (BATCH_PURPOSES). */
    purpose: varchar('purpose', { length: 20 }),
    penId: integer('pen_id').references(() => pens.id),
    notes: text('notes'),
    /** Free-form extra data for integrations; not shown in the form. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ...audit(),
  },
  (t) => [
    activeUnique('batches_batch_number_uq', t.tenantId, t.number),
    index('batches_pen_idx').on(t.penId),
    index('batches_supplier_idx').on(t.supplierId),
    index('batches_tenant_arrival_idx').on(t.tenantId, t.arrivalDate),
  ],
);
