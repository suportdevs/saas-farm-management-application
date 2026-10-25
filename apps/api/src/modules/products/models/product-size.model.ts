import { index, integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import { base, audit, status, activeUnique } from './columns';
import { units } from './unit.model';
import { sizes } from './size.model';
import { products } from './product.model';

export const productSizes = pgTable(
  'product_sizes',
  {
    ...base(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    unitId: integer('unit_id').references(() => units.id),
    // Null for the default size created with each product.
    sizeId: integer('size_id').references(() => sizes.id),
    name: varchar('name', { length: 150 }).notNull(),
    code: varchar('code', { length: 50 }),
    status: status(),
    ...audit(),
  },
  (t) => [
    activeUnique('product_sizes_code_uq', t.tenantId, t.code),
    index('product_sizes_product_idx').on(t.productId),
    index('product_sizes_size_idx').on(t.sizeId),
    index('product_sizes_unit_idx').on(t.unitId),
  ],
);
