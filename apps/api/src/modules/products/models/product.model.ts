import { index, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { base, audit, status, activeUnique } from './columns';
import { units } from './unit.model';
import { brands } from './brand.model';
import { categories } from './category.model';

export const products = pgTable(
  'products',
  {
    ...base(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    brandId: integer('brand_id').references(() => brands.id),
    name: varchar('name', { length: 150 }).notNull(),
    code: varchar('code', { length: 50 }).notNull(),
    description: text('description'),
    /** Image file name under products/<tenant_id>/ in storage. */
    image: varchar('image', { length: 100 }),
    unitId: integer('unit_id')
      .notNull()
      .references(() => units.id),
    status: status(),
    ...audit(),
  },
  (t) => [
    activeUnique('products_code_uq', t.tenantId, t.code),
    index('products_category_idx').on(t.categoryId),
    index('products_brand_idx').on(t.brandId),
    index('products_unit_idx').on(t.unitId),
  ],
);
