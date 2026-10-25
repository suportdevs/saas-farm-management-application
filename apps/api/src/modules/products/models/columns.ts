import { sql, type SQL } from 'drizzle-orm';
import { integer, smallint, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { users } from '../../../db/schema';
import { farms } from '../../farms/models/farm.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/**
 * Columns every catalog table has. `id` is internal (joins, foreign keys);
 * `key` is the public identifier used by the API and the web app.
 * `tenant_id` is the farm that owns the row.
 */
export const base = () => ({
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  key: uuid('key').notNull().unique().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => farms.id, { onDelete: 'cascade' }),
});

export const userRef = (column: string) =>
  uuid(column).references(() => users.id, { onDelete: 'set null' });

/** Audit columns. Rows are soft-deleted: `deleted_at is null` means "active". */
export const audit = () => ({
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
export const status = () => smallint('status').notNull().default(1);

const lower = (column: AnyPgColumn): SQL => sql`lower(${column})`;

/** Case-insensitive uniqueness among a tenant's non-deleted rows. */
export const activeUnique = (name: string, tenantId: AnyPgColumn, column: AnyPgColumn) =>
  uniqueIndex(name)
    .on(tenantId, lower(column))
    .where(sql`deleted_at is null`);
