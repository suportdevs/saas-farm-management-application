import { Router, type Request } from 'express';
import { and, count, countDistinct, desc, eq, gt, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  adminUpdateUserSchema,
  adminUserListQuerySchema,
  auditLogQuerySchema,
  banUserSchema,
  type AdminStats,
  type AdminUpdateUserInput,
  type AdminUser,
  type AdminUserListQuery,
  type AuditLogQuery,
  type BanUserInput,
  platformPermissionsOf,
} from '@kit/shared';
import { db } from '../../db/client';
import { auditLogs, jobs, sessions, users, type User } from '../../db/schema';
import { audit, serializeAuditLog } from '../../core/audit';
import { hooks } from '../../core/hooks';
import {
  createSession,
  deleteUserSessions,
  listUserSessions,
  setImpersonatorCookie,
  setSessionCookie,
} from '../../core/session';
import { serializeUser } from '../../core/user';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { requirePlatform, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { sendAccountSuspendedEmail } from '../auth/emails';

export const adminRouter = Router();
adminRouter.use(requireRole('admin'));

const DAY = 24 * 60 * 60 * 1000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function serializeAdminUser(user: User): Promise<AdminUser> {
  return {
    ...(await serializeUser(user)),
    bannedAt: user.bannedAt?.toISOString() ?? null,
    bannedReason: user.bannedReason,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    updatedAt: user.updatedAt.toISOString(),
  };
}

async function loadTarget(req: Request): Promise<User> {
  const id = String(req.params.id);
  if (!uuidPattern.test(id)) throw notFound('User not found');
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) throw notFound('User not found');
  return user;
}

function assertNotSelf(req: Request, target: User, message: string) {
  if (target.id === req.auth!.user.id) throw badRequest(message, 'SELF_ACTION');
}

adminRouter.get('/stats', requirePlatform('platform.stats.view'), async (_req, res) => {
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY);
  const [userCounts, sessionCounts, signupRows, jobCounts] = await Promise.all([
    db
      .select({
        total: count(),
        verified: count(users.emailVerifiedAt),
        admins: sql<number>`count(*) filter (where ${users.role} = 'admin')`.mapWith(Number),
        banned: count(users.bannedAt),
        new7d: sql<number>`count(*) filter (where ${users.createdAt} > ${new Date(now - 7 * DAY).toISOString()})`.mapWith(Number),
        new30d: sql<number>`count(*) filter (where ${users.createdAt} > ${since30.toISOString()})`.mapWith(Number),
      })
      .from(users),
    db
      .select({
        active: count(),
        activeUsers7d: countDistinct(sessions.userId),
      })
      .from(sessions)
      .where(and(gt(sessions.expiresAt, new Date()), isNull(sessions.pending), gt(sessions.lastSeenAt, new Date(now - 7 * DAY)))),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${users.createdAt}), 'YYYY-MM-DD')`,
        count: count(),
      })
      .from(users)
      .where(gt(users.createdAt, since30))
      .groupBy(sql`1`),
    db
      .select({
        pending: sql<number>`count(*) filter (where ${jobs.status} = 'pending')`.mapWith(Number),
        failed: sql<number>`count(*) filter (where ${jobs.status} = 'failed')`.mapWith(Number),
      })
      .from(jobs),
  ]);

  const byDay = new Map(signupRows.map((r) => [r.day, r.count]));
  const signups = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(now - (29 - i) * DAY).toISOString().slice(0, 10);
    return { date, count: byDay.get(date) ?? 0 };
  });

  const u = userCounts[0]!;
  const stats: AdminStats = {
    users: { ...u, activeSessions: sessionCounts[0]!.active, activeUsers7d: sessionCounts[0]!.activeUsers7d },
    signups,
    jobs: jobCounts[0]!,
  };
  res.json(stats);
});

adminRouter.get('/users', requirePlatform('platform.users.view'), validate(adminUserListQuerySchema, 'query'), async (req, res) => {
  const { page, pageSize, q, role, status } = req.query as unknown as AdminUserListQuery;
  const filters: SQL[] = [];
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    filters.push(or(ilike(users.email, pattern), ilike(users.name, pattern))!);
  }
  if (role) filters.push(eq(users.role, role));
  if (status === 'banned') filters.push(isNotNull(users.bannedAt));
  if (status === 'active') filters.push(isNull(users.bannedAt));
  if (status === 'unverified') filters.push(isNull(users.emailVerifiedAt));
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [total]] = await Promise.all([
    db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(users).where(where),
  ]);
  res.json({
    users: await Promise.all(rows.map(serializeAdminUser)),
    pagination: { page, pageSize, total: total?.value ?? 0 },
  });
});

adminRouter.get('/users/:id', requirePlatform('platform.users.view'), async (req, res) => {
  const user = await loadTarget(req);
  const userSessions = await listUserSessions(user.id);
  res.json({
    user: await serializeAdminUser(user),
    sessions: userSessions
      .filter((s) => !s.pending)
      .map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        impersonated: Boolean(s.impersonatorId),
      })),
  });
});

adminRouter.patch('/users/:id', requirePlatform('platform.users.update'), validate(adminUpdateUserSchema), async (req, res) => {
  const target = await loadTarget(req);
  const input = req.body as AdminUpdateUserInput;
  const changesRole = input.role !== undefined && input.role !== target.role;
  const changesStaffRole = input.staffRole !== undefined && input.staffRole !== target.staffRole;
  if (changesRole || changesStaffRole) {
    assertNotSelf(req, target, "You can't change your own role");
    // Making, removing and re-scoping staff is its own permission.
    if (!platformPermissionsOf(req.auth!.user).includes('platform.staff.manage')) {
      throw forbidden("Your staff role can't manage platform staff", 'PLATFORM_PERMISSION_REQUIRED');
    }
    if (changesStaffRole && (input.role ?? target.role) !== 'admin') {
      throw badRequest('Only admins can have a staff role', 'NOT_STAFF');
    }
  }

  const patch: Partial<User> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.role !== undefined) patch.role = input.role;
  if (input.staffRole !== undefined) patch.staffRole = input.staffRole;
  // Leaving the staff clears the staff role, so rejoining starts from scratch.
  if (input.role === 'user') patch.staffRole = null;
  if (input.emailVerified !== undefined) {
    patch.emailVerifiedAt = input.emailVerified ? (target.emailVerifiedAt ?? new Date()) : null;
  }
  const [user] = await db.update(users).set(patch).where(eq(users.id, target.id)).returning();
  await audit(req, { action: 'admin.user.updated', targetType: 'user', targetId: target.id, metadata: { ...input } });
  res.json({ user: await serializeAdminUser(user!) });
});

adminRouter.post('/users/:id/ban', requirePlatform('platform.users.suspend'), validate(banUserSchema), async (req, res) => {
  const target = await loadTarget(req);
  assertNotSelf(req, target, "You can't suspend your own account");
  const { reason } = req.body as BanUserInput;
  const [user] = await db
    .update(users)
    .set({ bannedAt: new Date(), bannedReason: reason || null })
    .where(eq(users.id, target.id))
    .returning();
  await deleteUserSessions(target.id);
  await sendAccountSuspendedEmail(target.email, target.name, reason);
  await audit(req, { action: 'admin.user.banned', targetType: 'user', targetId: target.id, metadata: { reason } });
  res.json({ user: await serializeAdminUser(user!) });
});

adminRouter.post('/users/:id/unban', requirePlatform('platform.users.suspend'), async (req, res) => {
  const target = await loadTarget(req);
  const [user] = await db
    .update(users)
    .set({ bannedAt: null, bannedReason: null })
    .where(eq(users.id, target.id))
    .returning();
  await audit(req, { action: 'admin.user.unbanned', targetType: 'user', targetId: target.id });
  res.json({ user: await serializeAdminUser(user!) });
});

adminRouter.delete('/users/:id/sessions', requirePlatform('platform.users.suspend'), async (req, res) => {
  const target = await loadTarget(req);
  assertNotSelf(req, target, 'Use Settings → Security to manage your own sessions');
  await deleteUserSessions(target.id);
  await audit(req, { action: 'admin.user.sessions_revoked', targetType: 'user', targetId: target.id });
  res.status(204).end();
});

/** Signs the admin in as another user for support/debugging. The admin's own session is kept aside. */
adminRouter.post('/users/:id/impersonate', requirePlatform('platform.users.impersonate'), async (req, res) => {
  const target = await loadTarget(req);
  assertNotSelf(req, target, "You can't impersonate yourself");
  if (target.role === 'admin') throw forbidden("Administrators can't be impersonated", 'CANNOT_IMPERSONATE_ADMIN');
  if (target.bannedAt) throw badRequest('Suspended users cannot be impersonated', 'USER_BANNED');

  const admin = req.auth!;
  const { token, session } = await createSession(req, target.id, { impersonatorId: admin.user.id });
  setImpersonatorCookie(res, admin.token);
  setSessionCookie(res, token, session);
  await audit(req, { action: 'admin.impersonation_started', targetType: 'user', targetId: target.id });
  res.json({ redirect: '/dashboard' });
});

adminRouter.delete('/users/:id', requirePlatform('platform.users.delete'), async (req, res) => {
  const target = await loadTarget(req);
  assertNotSelf(req, target, 'Delete your own account from Settings instead');
  await hooks.emit(hooks.userDeleting, target);
  await db.delete(users).where(eq(users.id, target.id));
  await audit(req, { action: 'admin.user.deleted', targetType: 'user', targetId: target.id, metadata: { email: target.email } });
  res.status(204).end();
});

adminRouter.get('/audit-logs', requirePlatform('platform.audit.view'), validate(auditLogQuerySchema, 'query'), async (req, res) => {
  const { page, pageSize, userId, action } = req.query as unknown as AuditLogQuery;
  const filters: SQL[] = [];
  if (userId) {
    filters.push(or(eq(auditLogs.actorId, userId), and(eq(auditLogs.targetType, 'user'), eq(auditLogs.targetId, userId)))!);
  }
  if (action) filters.push(ilike(auditLogs.action, `${action.replace(/[%_\\]/g, '\\$&')}%`));
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
  res.json({
    events: rows.map((r) => ({ ...serializeAuditLog(r.log), actor: r.actor?.id ? r.actor : null })),
    pagination: { page, pageSize, total: total?.value ?? 0 },
  });
});
