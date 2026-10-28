import { pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns, notDeletedRows, users } from '../../../db/schema';
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
    // Accepted, revoked and replaced invitations are soft-deleted.
    ...auditColumns(),
  },
  (t) => [uniqueIndex('farm_invitations_farm_email_active_unique').on(t.farmId, t.email).where(notDeletedRows)],
);

export type FarmInvitationRow = typeof farmInvitations.$inferSelect;
