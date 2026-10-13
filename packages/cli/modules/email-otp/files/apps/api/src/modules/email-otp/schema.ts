import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sessions, users } from '../../db/schema';

/** Users who require an emailed code at sign-in. */
export const emailOtpSettings = pgTable('email_otp_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  enabledAt: timestamp('enabled_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The outstanding code for a pending (half signed-in) session. */
export const emailOtpChallenges = pgTable('email_otp_challenges', {
  sessionId: uuid('session_id')
    .primaryKey()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull().defaultNow(),
});
