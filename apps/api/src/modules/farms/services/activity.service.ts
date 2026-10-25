import { and, count, desc, eq } from 'drizzle-orm';
import { auditLogs } from '../../../db/schema';
import { db, users } from '../../../core';

/** The farm's activity log: audit events targeting the farm, newest first. */
export async function listActivity(farmId: string, opts: { limit: number; offset: number }) {
  const where = and(eq(auditLogs.targetType, 'farm'), eq(auditLogs.targetId, farmId));
  const [rows, [total]] = await Promise.all([
    db
      .select({ log: auditLogs, actor: { id: users.id, name: users.name, email: users.email } })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ value: count() }).from(auditLogs).where(where),
  ]);
  return {
    entries: rows.map(({ log, actor }) => ({
      id: log.id,
      action: log.action,
      actor: actor?.id ? actor : null,
      metadata: log.metadata ?? {},
      createdAt: log.createdAt.toISOString(),
    })),
    total: total?.value ?? 0,
  };
}
