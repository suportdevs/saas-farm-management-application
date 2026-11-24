import { date, index, integer, pgTable, smallint, text, varchar } from 'drizzle-orm/pg-core';
import { warehouses } from '../../herd/models/warehouse.model';
import { employees } from '../../hr/models/employee.model';
import { activeUnique, audit, base } from '../../products/models/columns';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/**
 * Finished goods received into a warehouse against an order. Lines are in
 * finish_receive_items. status: 0 = Pending (editable), 1 = Processed (locked).
 */
export const finishReceives = pgTable(
  'finish_receives',
  {
    ...base(),
    /** Unique per farm. */
    orderNo: varchar('order_no', { length: 30 }).notNull(),
    receiveDate: date('receive_date', { mode: 'string' }).notNull(),
    warehouseId: integer('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    /** The employee who received the goods. */
    receiveBy: integer('receive_by').references(() => employees.id),
    note: text('note'),
    /** 0 = Pending, 1 = Processed. */
    status: smallint('status').notNull().default(0),
    ...audit(),
  },
  (t) => [
    activeUnique('finish_receives_order_no_uq', t.tenantId, t.orderNo),
    index('finish_receives_tenant_date_idx').on(t.tenantId, t.receiveDate),
    index('finish_receives_warehouse_idx').on(t.warehouseId),
    index('finish_receives_receive_by_idx').on(t.receiveBy),
  ],
);
