import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/** Single-use sign-in links. Keyed by email so they also work for sign-up when enabled. */
export const magicLinkTokens = pgTable('magic_link_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 254 }).notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  // Where to land after signing in (validated relative path).
  next: varchar('next', { length: 500 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
