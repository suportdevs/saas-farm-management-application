import { index, pgEnum, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../../db/schema';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

export const orgRole = pgEnum('org_role', ['owner', 'admin', 'member']);

/** The client (company, co-op, family business) that owns one or more farms. */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] }), index('organization_members_user_idx').on(t.userId)],
);

export type Organization = typeof organizations.$inferSelect;
export type OrganizationMemberRow = typeof organizationMembers.$inferSelect;
