import { sql } from 'drizzle-orm';
import { check, date, index, integer, numeric, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { suppliers } from '../../distribution/models/supplier.model';
import { batches } from '../../herd/models/batch.model';
import { activeUnique, audit, base } from '../../products/models/columns';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: 'number' }).notNull().default(0);

/**
 * A procurement: one trip / invoice. Its shared costs (transport, broker fee,
 * toll, other) are split over its animals (purchase_items) by price share.
 */
export const purchases = pgTable(
  'purchases',
  {
    ...base(),
    /** purchase_no — unique per farm. */
    number: varchar('purchase_no', { length: 30 }).notNull(),
    purchaseDate: date('purchase_date', { mode: 'string' }).notNull(),
    /** The batch the animals join (optional). */
    batchId: integer('batch_id').references(() => batches.id),
    supplierId: integer('supplier_id').references(() => suppliers.id),
    /** A broker is a supplier too (e.g. of type "Broker"). */
    brokerId: integer('broker_id').references(() => suppliers.id),
    /** haat · farmer · supplier · import (PURCHASE_SOURCE_TYPES). */
    sourceType: varchar('source_type', { length: 20 }).notNull(),
    haatName: varchar('haat_name', { length: 100 }),
    transportCost: money('transport_cost'),
    brokerFee: money('broker_fee'),
    tollCost: money('toll_cost'),
    otherCost: money('other_cost'),
    notes: text('notes'),
    ...audit(),
  },
  (t) => [
    activeUnique('purchases_purchase_no_uq', t.tenantId, t.number),
    index('purchases_tenant_date_idx').on(t.tenantId, t.purchaseDate),
    index('purchases_supplier_idx').on(t.supplierId),
    index('purchases_broker_idx').on(t.brokerId),
    index('purchases_batch_idx').on(t.batchId),
    check('purchases_source_type_check', sql`${t.sourceType} in ('haat', 'farmer', 'supplier', 'import')`),
  ],
);
