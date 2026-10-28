import { sql } from 'drizzle-orm';
import { jsonb, pgEnum, pgTable, primaryKey, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns, notDeletedRows, users } from '../../../db/schema';
import { farms } from './farm.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

export const farmRole = pgEnum('farm_role', ['owner', 'manager', 'veterinarian', 'accountant', 'worker', 'viewer']);

/** Roles a farm defines itself, each with its own set of per-action permission keys. */
export const farmCustomRoles = pgTable(
  'farm_custom_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    farmId: uuid('farm_id')
      .notNull()
      .references(() => farms.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 60 }).notNull(),
    description: varchar('description', { length: 255 }),
    permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...auditColumns(),
  },
  // Names are unique among the farm's roles that are not deleted.
  (t) => [uniqueIndex('farm_custom_roles_farm_name_unique').on(t.farmId, sql`lower(${t.name})`).where(notDeletedRows)],
);

/**
 * A farm's changes to a role's default permissions, stored as allow/deny per
 * key so permissions added later still follow the role's defaults.
 * No row (or a deleted one) = the role's defaults.
 */
export const farmRolePermissions = pgTable(
  'farm_role_permissions',
  {
    farmId: uuid('farm_id')
      .notNull()
      .references(() => farms.id, { onDelete: 'cascade' }),
    role: farmRole('role').notNull(),
    overrides: jsonb('overrides').$type<Record<string, boolean>>().notNull().default({}),
    updatedById: uuid('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
    // "Reset to defaults" soft-deletes the row; saving again brings it back (same farm + role key).
    ...auditColumns(),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.role] })],
);

export type FarmCustomRoleRow = typeof farmCustomRoles.$inferSelect;
export type FarmRolePermissionsRow = typeof farmRolePermissions.$inferSelect;
