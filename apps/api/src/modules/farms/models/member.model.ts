import { index, jsonb, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../../db/schema';
import { farms } from './farm.model';
import { farmCustomRoles, farmRole } from './role.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

export const farmMembers = pgTable(
  'farm_members',
  {
    farmId: uuid('farm_id')
      .notNull()
      .references(() => farms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: farmRole('role').notNull().default('worker'),
    /** Set when the member has one of the farm's custom roles; its keys replace the system role's. */
    customRoleId: uuid('custom_role_id').references(() => farmCustomRoles.id, { onDelete: 'no action' }),
    /** Free-text job title, e.g. "Herd manager". */
    title: varchar('title', { length: 80 }),
    /** Per-member allow (true) / deny (false) of single permission keys, on top of the role. */
    permissionOverrides: jsonb('permission_overrides').$type<Record<string, boolean>>().notNull().default({}),
    /** Used to reopen the farm the user worked in last. */
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.userId] }), index('farm_members_user_idx').on(t.userId)],
);

export type FarmMemberRow = typeof farmMembers.$inferSelect;
