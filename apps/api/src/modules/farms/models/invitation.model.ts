import { pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../../db/schema';
import { farms } from './farm.model';
import { farmCustomRoles, farmRole } from './role.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

export const farmInvitations = pgTable(
  'farm_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    farmId: uuid('farm_id')
      .notNull()
      .references(() => farms.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 254 }).notNull(),
    role: farmRole('role').notNull().default('worker'),
    /** A custom role to join with (members keep the base system role underneath). */
    customRoleId: uuid('custom_role_id').references(() => farmCustomRoles.id, { onDelete: 'no action' }),
    title: varchar('title', { length: 80 }),
    // SHA-256 of the emailed token.
    tokenHash: text('token_hash').notNull().unique(),
    invitedById: uuid('invited_by_id').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('farm_invitations_farm_email_unique').on(t.farmId, t.email)],
);

export type FarmInvitationRow = typeof farmInvitations.$inferSelect;
