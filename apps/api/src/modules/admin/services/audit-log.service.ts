import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { AuditLogQuery } from '@kit/shared';
import { db } from '../../../db/client';
import { auditLogs, users } from '../../../db/schema';
import { serializeAuditLog } from '../../../core/audit';
import { escapeLike } from '../../../lib/text';

/** The platform-wide audit log, filtered by user (as actor or target) and action prefix. */
export async function listAuditEvents({ page, pageSize, userId, action }: AuditLogQuery) {
  const filters: SQL[] = [];
  if (userId) {
    filters.push(or(eq(auditLogs.actorId, userId), and(eq(auditLogs.targetType, 'user'), eq(auditLogs.targetId, userId)))!);
  }
  if (action) filters.push(ilike(auditLogs.action, `${escapeLike(action)}%`));
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .select({ log: auditLogs, actor: { id: users.id, name: users.name, email: users.email } })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(auditLogs).where(where),
  ]);
  return {
    events: rows.map((r) => ({ ...serializeAuditLog(r.log), actor: r.actor?.id ? r.actor : null })),
    pagination: { page, pageSize, total: total?.value ?? 0 },
  };
}
