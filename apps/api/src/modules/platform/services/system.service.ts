import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import type { PlatformInfo } from '@kit/shared';
import { db, env } from '../../../core';
import { pendingMigrations } from '../../../db/migration-status';
import { jobs } from '../../../db/schema';
import { billingSettings } from '../../subscriptions';

const startedAt = new Date();

/** The API's package.json version (falls back to "unknown" in builds without it). */
function appVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function databaseInfo(): Promise<PlatformInfo['database']> {
  try {
    const result = await db.execute<{ version: string; name: string; size: string }>(
      sql`select version() as version, current_database() as name, pg_database_size(current_database()) as size`,
    );
    const row = result.rows[0]!;
    return {
      connected: true,
      // "PostgreSQL 17.2 on x86_64-pc-linux-musl, compiled by…" → "PostgreSQL 17.2"
      version: row.version.split(' ').slice(0, 2).join(' '),
      name: row.name,
      sizeBytes: Number(row.size),
      pendingMigrations: (await pendingMigrations()) ?? [],
    };
  } catch {
    return { connected: false, version: null, name: null, sizeBytes: null, pendingMigrations: [] };
  }
}

async function jobCounts() {
  try {
    const [row] = await db
      .select({
        pending: sql<number>`count(*) filter (where ${jobs.status} = 'pending')`.mapWith(Number),
        failed: sql<number>`count(*) filter (where ${jobs.status} = 'failed')`.mapWith(Number),
      })
      .from(jobs);
    return row ?? { pending: 0, failed: 0 };
  } catch {
    return { pending: 0, failed: 0 };
  }
}

/**
 * How the platform is running and configured, for the admin Platform page.
 * Secrets (passwords, API keys) are never returned — only whether they are set.
 */
export async function platformInfo(): Promise<PlatformInfo> {
  // Imported here, not at the top: app-modules imports this module, so a static import would be circular.
  const [{ appModules }, { installedModules }] = await Promise.all([import('../../app-modules'), import('../../registry')]);
  const [database, jobStats] = await Promise.all([databaseInfo(), jobCounts()]);

  return {
    app: {
      name: env.APP_NAME,
      environment: env.NODE_ENV,
      version: appVersion(),
      webUrl: env.WEB_URL,
      port: env.PORT,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    },
    runtime: {
      node: process.version,
      os: `${os.type()} ${os.release()} (${process.arch})`,
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    database,
    email: {
      smtpConfigured: Boolean(env.SMTP_HOST),
      host: env.SMTP_HOST ?? null,
      port: env.SMTP_PORT,
      from: env.MAIL_FROM,
      verification: env.EMAIL_VERIFICATION,
      welcomeEmail: env.SEND_WELCOME_EMAIL,
    },
    billing: billingSettings(),
    security: {
      loginMaxAttempts: env.LOGIN_MAX_ATTEMPTS,
      lockoutMinutes: env.LOGIN_LOCKOUT_MINUTES,
      captcha: env.CAPTCHA_ENABLED ? env.CAPTCHA_FORMS : [],
      rateLimitStore: env.RATE_LIMIT_STORE,
      sessionTtlDays: env.SESSION_TTL_DAYS,
      adminEmails: env.ADMIN_EMAILS.length,
    },
    jobs: {
      workerInProcess: env.RUN_WORKER,
      concurrency: env.JOB_CONCURRENCY,
      pollIntervalMs: env.JOB_POLL_INTERVAL_MS,
      ...jobStats,
    },
    storage: { uploadDir: env.UPLOAD_DIR },
    modules: [...appModules, ...installedModules].map((m) => m.name),
  };
}
