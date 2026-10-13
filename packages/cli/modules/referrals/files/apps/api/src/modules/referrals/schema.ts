import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../db/schema';

/** Each user's personal invitation code (created lazily). */
export const referralCodes = pgTable('referral_codes', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 32 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Who signed up through whose link. A user can only be referred once. */
export const referrals = pgTable(
  'referrals',
  {
    referredUserId: uuid('referred_user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    referrerId: uuid('referrer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('referrals_referrer_idx').on(t.referrerId, t.createdAt)],
);
