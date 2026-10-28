import { index, pgEnum, pgTable, primaryKey, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns, users } from '../../../db/schema';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

export const orgRole = pgEnum('org_role', ['owner', 'admin', 'member']);

/** The client (company, co-op, family business) that owns one or more farms. */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  ...auditColumns(),
});

export const organizationMembers = pgTable(
  'organization_members',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: orgRole('role').notNull().default('member'),
    // A removed member's row is soft-deleted; adding them again brings it back (same org + user key).
    ...auditColumns(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] }), index('organization_members_user_idx').on(t.userId)],
);

export type Organization = typeof organizations.$inferSelect;
export type OrganizationMemberRow = typeof organizationMembers.$inferSelect;
