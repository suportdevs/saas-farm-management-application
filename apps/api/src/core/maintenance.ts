import { and, eq, lt } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db/client';
import { jobs } from '../db/schema';
import { purgeExpiredRateLimits } from '../middleware/rate-limit';
import { purgeAuditLogs } from './audit';
import { schedule } from './jobs';
import { purgeExpiredSessions } from './session';
import { purgeExpiredTokens } from './tokens';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Housekeeping tasks, run by whichever worker picks them up first. */
export function registerMaintenanceTasks() {
  schedule('purge-expired-auth', HOUR, async () => {
    await purgeExpiredSessions();
    await purgeExpiredTokens();
    await purgeExpiredRateLimits();
  });

  schedule('purge-old-records', DAY, async () => {
    await purgeAuditLogs(env.AUDIT_LOG_RETENTION_DAYS);
    await db.delete(jobs).where(and(eq(jobs.status, 'completed'), lt(jobs.updatedAt, new Date(Date.now() - 7 * DAY))));
    await db.delete(jobs).where(and(eq(jobs.status, 'failed'), lt(jobs.updatedAt, new Date(Date.now() - 30 * DAY))));
  });
}
