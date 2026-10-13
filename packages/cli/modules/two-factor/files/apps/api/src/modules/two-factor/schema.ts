import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../db/schema';

export const twoFactor = pgTable('two_factor', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // TOTP secret, AES-256-GCM encrypted with a key derived from APP_SECRET.
  secret: text('secret').notNull(),
  // SHA-256 hashes of unused backup codes.
  backupCodes: jsonb('backup_codes').$type<string[]>().notNull().default([]),
  // Last accepted TOTP time step — prevents replaying the same code.
  lastUsedStep: integer('last_used_step'),
  // Null while setup is in progress (secret generated but not confirmed).
  enabledAt: timestamp('enabled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TwoFactor = typeof twoFactor.$inferSelect;
