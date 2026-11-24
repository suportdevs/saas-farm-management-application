import { pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { activeUnique, audit, base } from '../../products/models/columns';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** Warehouses / stores of the farm (feed store, medicine store…). Name is unique per farm. */
export const warehouses = pgTable(
  'warehouses',
  {
    ...base(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    ...audit(),
  },
  (t) => [activeUnique('warehouses_name_uq', t.tenantId, t.name)],
);
