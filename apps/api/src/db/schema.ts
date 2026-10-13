import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// NOTE: keep imports in schema files relative (no "@/" aliases) — drizzle-kit loads them directly.

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const userRole = pgEnum('user_role', ['user', 'admin']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  // Null for accounts created through social login until a password is set.
  passwordHash: text('password_hash'),
  image: text('image'),
  role: userRole('role').notNull().default('user'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  // Suspended accounts cannot sign in and all their sessions are revoked.
  bannedAt: timestamp('banned_at', { withTimezone: true }),
  bannedReason: varchar('banned_reason', { length: 500 }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  ...timestamps,
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // SHA-256 of the cookie token — the raw token is never stored.
    tokenHash: text('token_hash').notNull().unique(),
    // Name of an outstanding challenge (e.g. "two-factor"). A session with a
    // pending challenge is NOT authenticated until the challenge is completed.
    pending: varchar('pending', { length: 50 }),
    persistent: boolean('persistent').notNull().default(true),
    // Set when an admin is signed in as this user (support / debugging).
    impersonatorId: uuid('impersonator_id').references(() => users.id, { onDelete: 'cascade' }),
    userAgent: text('user_agent'),
    ip: varchar('ip', { length: 64 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const verificationTokenType = pgEnum('verification_token_type', [
  'email_verification',
  'password_reset',
  'email_change',
]);

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: verificationTokenType('type').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    // Extra data bound to the token, e.g. the new address for an email change.
    data: jsonb('data').$type<Record<string, unknown>>(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_tokens_user_type_idx').on(t.userId, t.type)],
);

/**
 * Append-only record of security-relevant events (sign-ins, password changes,
 * admin actions…). Written through `audit()` in core/audit.ts.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Who did it. Null for anonymous events (e.g. a failed sign-in).
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    // Dotted event name, e.g. "auth.login", "admin.user.banned".
    action: varchar('action', { length: 100 }).notNull(),
    targetType: varchar('target_type', { length: 50 }),
    targetId: varchar('target_id', { length: 100 }),
    ip: varchar('ip', { length: 64 }),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_actor_idx').on(t.actorId, t.createdAt),
    index('audit_logs_target_idx').on(t.targetType, t.targetId),
    index('audit_logs_created_at_idx').on(t.createdAt),
  ],
);

export const jobStatus = pgEnum('job_status', ['pending', 'running', 'completed', 'failed']);

/** Durable background job queue (see core/jobs.ts). Workers claim rows with SKIP LOCKED. */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    payload: jsonb('payload').$type<unknown>(),
    status: jobStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lastError: text('last_error'),
    // Optional de-duplication key: a second job with the same key is ignored.
    uniqueKey: varchar('unique_key', { length: 200 }).unique(),
    ...timestamps,
  },
  (t) => [index('jobs_status_run_at_idx').on(t.status, t.runAt)],
);

/** Shared counters for the Postgres rate-limit store (multi-instance deployments). */
export const rateLimits = pgTable('rate_limits', {
  key: varchar('key', { length: 300 }).primaryKey(),
  hits: integer('hits').notNull(),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions, { relationName: 'session_user' }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id], relationName: 'session_user' }),
  impersonator: one(users, { fields: [sessions.impersonatorId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Job = typeof jobs.$inferSelect;
