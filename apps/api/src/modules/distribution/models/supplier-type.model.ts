import { pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { activeUnique, audit, base } from '../../products/models/columns';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** Kinds of suppliers: Livestock, Feed, Veterinary, Equipment… */
export const supplierTypes = pgTable(
  'supplier_types',
  {
    ...base(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    ...audit(),
  },
  (t) => [activeUnique('supplier_types_name_uq', t.tenantId, t.name)],
);
