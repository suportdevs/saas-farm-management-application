import { pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { activeUnique, audit, base } from '../../products/models/columns';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** Kinds of customers: Slaughterhouse, Trader, Individual, Auction… */
export const customerTypes = pgTable(
  'customer_types',
  {
    ...base(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    ...audit(),
  },
  (t) => [activeUnique('customer_types_name_uq', t.tenantId, t.name)],
);
