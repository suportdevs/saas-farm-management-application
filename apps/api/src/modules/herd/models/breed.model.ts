import { boolean, integer, numeric, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { farms } from '../../farms/models/farm.model';
import { activeUnique, audit } from '../../products/models/columns';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/**
 * Cattle breeds. Rows with `tenant_id` null are built-in (`is_system`) and
 * shared by every farm, read-only; farms add their own rows next to them.
 * (Own columns instead of `base()`: here `tenant_id` may be null.)
 */
export const breeds = pgTable(
  'breeds',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    key: uuid('key').notNull().unique().defaultRandom(),
    /** Null for built-in breeds. */
    tenantId: uuid('tenant_id').references(() => farms.id, { onDelete: 'cascade' }),
    /** Stored as `breed_name`; called `name` in code so the catalog engine can show and sort it. */
    name: varchar('breed_name', { length: 100 }).notNull(),
    code: varchar('breed_code', { length: 50 }),
    /** beef · dairy · dual_purpose (BREED_TYPES). */
    type: varchar('breed_type', { length: 50 }),
    originCountry: varchar('origin_country', { length: 100 }),
    avgMatureWeight: numeric('avg_mature_weight', { precision: 8, scale: 2, mode: 'number' }),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    ...audit(),
  },
  // Unique per farm; built-in rows (null tenant) are managed by migrations.
  (t) => [activeUnique('breeds_breed_name_uq', t.tenantId, t.name)],
);
