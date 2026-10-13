import type { Request } from 'express';
import { and, desc, eq, lt, or, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { auditLogs, type AuditLog } from '../db/schema';
import { logger } from '../lib/logger';

export interface AuditEvent {
  /** Dotted event name, e.g. "auth.login" or "admin.user.banned". */
  action: string;
  /** Defaults to the signed-in user (`req.auth.user.id`). Pass null for anonymous events. */
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Records a security-relevant event. Never throws — a failed audit write is
 * logged but must not break the request that triggered it.
 */
export async function audit(req: Request | null, event: AuditEvent): Promise<void> {
  const actorId = event.actorId !== undefined ? event.actorId : (req?.auth?.user.id ?? null);
  // While impersonating, attribute actions to the admin and remember who was impersonated.
  const impersonatorId = req?.auth?.session.impersonatorId;
  const metadata = impersonatorId ? { ...event.metadata, impersonatorId } : event.metadata;
  try {
    await db.insert(auditLogs).values({
      action: event.action,
      actorId,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      metadata: metadata ?? null,
      ip: req?.ip?.slice(0, 64) ?? null,
      userAgent: req?.get('user-agent')?.slice(0, 500) ?? null,
    });
  } catch (err) {
    logger.error({ err, action: event.action }, 'Failed to write audit log');
  }
}

export interface AuditQuery {
  actorId?: string;
  /** Events performed by OR targeting this user. */
  userId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

export async function listAuditLogs(q: AuditQuery): Promise<AuditLog[]> {
  const filters: SQL[] = [];
  if (q.actorId) filters.push(eq(auditLogs.actorId, q.actorId));
  if (q.userId) {
    filters.push(
      or(eq(auditLogs.actorId, q.userId), and(eq(auditLogs.targetType, 'user'), eq(auditLogs.targetId, q.userId)))!,
    );
  }
  if (q.action) filters.push(eq(auditLogs.action, q.action));
  return db
    .select()
    .from(auditLogs)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(q.limit ?? 50)
    .offset(q.offset ?? 0);
}

export async function purgeAuditLogs(olderThanDays: number) {
  await db.delete(auditLogs).where(lt(auditLogs.createdAt, new Date(Date.now() - olderThanDays * 86_400_000)));
}

export const serializeAuditLog = (row: AuditLog) => ({
  id: row.id,
  action: row.action,
  actorId: row.actorId,
  targetType: row.targetType,
  targetId: row.targetId,
  ip: row.ip,
  userAgent: row.userAgent,
  metadata: row.metadata ?? {},
  createdAt: row.createdAt.toISOString(),
});
