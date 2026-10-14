import { sql, type SQL } from 'drizzle-orm';
import {
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from '../../db/schema';
import { farms } from '../farms/schema';

// NOTE: keep imports in schema files relative — drizzle-kit loads them directly.

/**
 * Columns every catalog table has. `id` is internal (joins, foreign keys);
 * `key` is the public identifier used by the API and the web app.
 * `tenant_id` is the farm that owns the row.
 */
const base = () => ({
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  key: uuid('key').notNull().unique().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => farms.id, { onDelete: 'cascade' }),
});

const userRef = (column: string) =>
  uuid(column).references(() => users.id, { onDelete: 'set null' });

/** Audit columns. Rows are soft-deleted: `deleted_at is null` means "active". */
const audit = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: userRef('created_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: userRef('updated_by'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: userRef('deleted_by'),
});

/** 1 = active, 0 = inactive. */
const status = () => smallint('status').notNull().default(1);

const lower = (column: AnyPgColumn): SQL => sql`lower(${column})`;

/** Case-insensitive uniqueness among a tenant's non-deleted rows. */
const activeUnique = (name: string, tenantId: AnyPgColumn, column: AnyPgColumn) =>
  uniqueIndex(name)
    .on(tenantId, lower(column))
    .where(sql`deleted_at is null`);

export const units = pgTable(
  'units',
  {
    ...base(),
    name: varchar('name', { length: 100 }).notNull(),
    shortName: varchar('short_name', { length: 20 }).notNull(),
    description: text('description'),
    ...audit(),
  },
  (t) => [
    activeUnique('units_name_uq', t.tenantId, t.name),
    activeUnique('units_short_name_uq', t.tenantId, t.shortName),
  ],
);

export const sizes = pgTable(
  'sizes',
  {
    ...base(),
    name: varchar('name', { length: 100 }).notNull(),
    shortName: varchar('short_name', { length: 20 }),
    weight: numeric('weight', { precision: 12, scale: 3, mode: 'number' }).notNull(),
    description: text('description'),
    ...audit(),
  },
  (t) => [
    activeUnique('sizes_name_uq', t.tenantId, t.name),
    activeUnique('sizes_short_name_uq', t.tenantId, t.shortName),
  ],
);

export const colors = pgTable(
  'colors',
  {
    ...base(),
    name: varchar('name', { length: 100 }).notNull(),
    code: varchar('code', { length: 30 }),
    description: text('description'),
    ...audit(),
  },
  (t) => [activeUnique('colors_name_uq', t.tenantId, t.name)],
);

export const brands = pgTable(
  'brands',
  {
    ...base(),
    name: varchar('name', { length: 100 }).notNull(),
    code: varchar('code', { length: 30 }),
    description: text('description'),
    ...audit(),
  },
  (t) => [
    activeUnique('brands_name_uq', t.tenantId, t.name),
    activeUnique('brands_code_uq', t.tenantId, t.code),
  ],
);

export const categories = pgTable(
  'categories',
  {
    ...base(),
    name: varchar('name', { length: 100 }).notNull(),
    code: varchar('code', { length: 30 }),
    description: text('description'),
    ...audit(),
  },
  (t) => [
    activeUnique('categories_name_uq', t.tenantId, t.name),
    activeUnique('categories_code_uq', t.tenantId, t.code),
  ],
);

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
