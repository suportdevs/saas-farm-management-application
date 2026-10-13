import { index, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../db/schema';

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 32 }).notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    email: varchar('email', { length: 254 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('oauth_accounts_provider_account_uq').on(t.provider, t.providerAccountId),
    unique('oauth_accounts_user_provider_uq').on(t.userId, t.provider),
    index('oauth_accounts_user_id_idx').on(t.userId),
  ],
);

export type OAuthAccount = typeof oauthAccounts.$inferSelect;
