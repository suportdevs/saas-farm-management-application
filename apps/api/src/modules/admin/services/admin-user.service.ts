import { and, count, countDistinct, desc, eq, gt, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { isStaffRole, type AdminStats, type AdminUpdateUserInput, type AdminUser, type AdminUserListQuery } from '@kit/shared';
import { db } from '../../../db/client';
import { jobs, sessions, users, type User } from '../../../db/schema';
import { hooks } from '../../../core/hooks';
import { deleteUserSessions } from '../../../core/session';
import { resolveStaff } from '../../../core/staff';
import { serializeUser } from '../../../core/user';
import { badRequest, forbidden, notFound } from '../../../lib/errors';
import { sendAccountSuspendedEmail } from '../../auth/services/email.service';
import { platformRoleExists } from './staff-role.service';

const DAY = 24 * 60 * 60 * 1000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function serializeAdminUser(user: User): Promise<AdminUser> {
  return {
    ...(await serializeUser(user)),
    bannedAt: user.bannedAt?.toISOString() ?? null,
    bannedReason: user.bannedReason,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    updatedAt: user.updatedAt.toISOString(),
  };
}

/** A user by id, or 404. */
export async function findUser(id: string): Promise<User> {
  if (!uuidPattern.test(id)) throw notFound('User not found');
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) throw notFound('User not found');
  return user;
}

/** Throws when an admin tries `message`'s action on their own account. */
export function assertNotSelf(actor: User, target: User, message: string) {
  if (target.id === actor.id) throw badRequest(message, 'SELF_ACTION');
}

/** Users, sessions, sign-ups and background jobs at a glance. */
export async function adminStats(): Promise<AdminStats> {
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
  return {
    users: { ...u, activeSessions: sessionCounts[0]!.active, activeUsers7d: sessionCounts[0]!.activeUsers7d },
    signups,
    jobs: jobCounts[0]!,
  };
}

export async function listUsers({ page, pageSize, q, role, status }: AdminUserListQuery) {
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
  return {
    users: await Promise.all(rows.map(serializeAdminUser)),
    pagination: { page, pageSize, total: total?.value ?? 0 },
  };
}

/**
 * Edits a user. Changing someone's role or staff role needs `platform.staff.manage`,
 * and nobody hands out (or re-scopes someone with) more access than they hold.
 */
export async function updateUser(actorUser: User, target: User, input: AdminUpdateUserInput) {
  const changesRole = input.role !== undefined && input.role !== target.role;
  const changesStaffRole = input.staffRole !== undefined && input.staffRole !== target.staffRole;
  const patch: Partial<User> = {};
  if (changesRole || changesStaffRole) {
    assertNotSelf(actorUser, target, "You can't change your own role");
    // Making, removing and re-scoping staff is its own permission.
    const actor = (await resolveStaff(actorUser))!;
    if (!actor.permissions.includes('platform.staff.manage')) {
      throw forbidden("Your staff role can't manage platform staff", 'PLATFORM_PERMISSION_REQUIRED');
    }
    const outranks = (perms: readonly string[]) => actor.key === 'super_admin' || perms.every((p) => actor.permissions.includes(p as never));
    // Nobody re-scopes staff who can do more than they can.
    const current = await resolveStaff(target);
    if (current && !outranks(current.permissions)) throw forbidden('That staff member can do more than you can', 'PERMISSION_ESCALATION');

    const becomesStaff = (input.role ?? target.role) === 'admin';
    if (!becomesStaff) {
      if (changesStaffRole && input.staffRole !== null) throw badRequest('Only admins can have a staff role', 'NOT_STAFF');
      // Leaving the staff clears the staff role, so rejoining starts from scratch.
      patch.staffRole = null;
    } else {
      // New staff start with the least access unless a role is chosen.
      const key = input.staffRole !== undefined ? input.staffRole : target.role === 'admin' ? target.staffRole : 'analyst';
      const next = await resolveStaff({ role: 'admin', staffRole: key });
      if (!next || (!isStaffRole(next.key) && !(await platformRoleExists(next.key)))) {
        throw badRequest('That staff role does not exist', 'UNKNOWN_STAFF_ROLE');
      }
      if (next.key === 'super_admin' && actor.key !== 'super_admin') throw forbidden('Only super admins can appoint super admins', 'PERMISSION_ESCALATION');
      if (!outranks(next.permissions)) throw forbidden('That staff role can do more than you can', 'PERMISSION_ESCALATION');
      patch.staffRole = key;
    }
  }

  if (input.name !== undefined) patch.name = input.name;
  if (input.role !== undefined) patch.role = input.role;
  if (input.emailVerified !== undefined) {
    patch.emailVerifiedAt = input.emailVerified ? (target.emailVerifiedAt ?? new Date()) : null;
  }
  const [user] = await db.update(users).set(patch).where(eq(users.id, target.id)).returning();
  return user!;
}

/** Suspends an account: every session is revoked and the user is told by email. */
export async function banUser(target: User, reason: string | undefined) {
  const [user] = await db
    .update(users)
    .set({ bannedAt: new Date(), bannedReason: reason || null })
    .where(eq(users.id, target.id))
    .returning();
  await deleteUserSessions(target.id);
  await sendAccountSuspendedEmail(target.email, target.name, reason);
  return user!;
}

export async function unbanUser(target: User) {
  const [user] = await db
    .update(users)
    .set({ bannedAt: null, bannedReason: null })
    .where(eq(users.id, target.id))
    .returning();
  return user!;
}

/** Deletes an account; modules clean up first, sessions and module rows cascade. */
export async function deleteUser(target: User) {
  await hooks.emit(hooks.userDeleting, target);
  await db.delete(users).where(eq(users.id, target.id));
}
