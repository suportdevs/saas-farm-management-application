import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../db/schema';

/** WebAuthn credentials (passkeys / security keys). */
export const passkeys = pgTable(
  'passkeys',
  {
    // Credential id, base64url.
    id: varchar('id', { length: 512 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // COSE public key, base64url.
    publicKey: text('public_key').notNull(),
    // Signature counter — a decrease signals a cloned authenticator.
    counter: integer('counter').notNull().default(0),
    transports: jsonb('transports').$type<string[]>(),
    deviceType: varchar('device_type', { length: 20 }).notNull(),
    backedUp: boolean('backed_up').notNull().default(false),
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [index('passkeys_user_id_idx').on(t.userId)],
);

export type Passkey = typeof passkeys.$inferSelect;
