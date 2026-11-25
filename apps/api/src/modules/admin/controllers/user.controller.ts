import type { Request, Response } from 'express';
import type { AdminCreateUserInput, AdminUpdateUserInput, AdminUserListQuery, BanUserInput } from '@kit/shared';
import { audit } from '../../../core/audit';
import { isDeveloper } from '../../../core/staff';
import { createSession, deleteUserSessions, listUserSessions, setImpersonatorCookie, setSessionCookie } from '../../../core/session';
import { badRequest, forbidden } from '../../../lib/errors';
import * as users from '../services/admin-user.service';

const target = (req: Request) => users.findUser(String(req.params.id));

/** GET /stats */
export async function stats(_req: Request, res: Response) {
  res.json(await users.adminStats());
}

/** GET /users */
export async function list(req: Request, res: Response) {
  res.json(await users.listUsers(req.query as unknown as AdminUserListQuery));
}

/** POST /users — an account for a client; they get an email to set their password. */
export async function create(req: Request, res: Response) {
  const user = await users.createClientUser(req.body as Required<AdminCreateUserInput>);
  await audit(req, { action: 'admin.user.created', targetType: 'user', targetId: user.id, metadata: { email: user.email } });
  res.status(201).json({ user: await users.serializeAdminUser(user) });
}

/** GET /users/:id — the user and their active sessions. */
export async function show(req: Request, res: Response) {
  const user = await target(req);
  const userSessions = await listUserSessions(user.id);
  res.json({
    user: await users.serializeAdminUser(user),
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
}

/** PATCH /users/:id */
export async function update(req: Request, res: Response) {
  const user = await target(req);
  const input = req.body as AdminUpdateUserInput;
  assertMayManage(req, user);
  const updated = await users.updateUser(req.auth!.user, user, input);
  await audit(req, { action: 'admin.user.updated', targetType: 'user', targetId: user.id, metadata: { ...input } });
  res.json({ user: await users.serializeAdminUser(updated) });
}

/** Only the developer may change the developer account. */
function assertMayManage(req: Request, user: Parameters<typeof isDeveloper>[0]) {
  if (isDeveloper(user) && !isDeveloper(req.auth!.user)) throw forbidden('The developer account can only be changed by the developer', 'DEVELOPER_PROTECTED');
}

/** POST /users/:id/ban */
export async function ban(req: Request, res: Response) {
  const user = await target(req);
  users.assertNotSelf(req.auth!.user, user, "You can't suspend your own account");
  assertMayManage(req, user);
  const { reason } = req.body as BanUserInput;
  const updated = await users.banUser(user, reason);
  await audit(req, { action: 'admin.user.banned', targetType: 'user', targetId: user.id, metadata: { reason } });
  res.json({ user: await users.serializeAdminUser(updated) });
}

/** POST /users/:id/unban */
export async function unban(req: Request, res: Response) {
  const user = await target(req);
  assertMayManage(req, user);
  const updated = await users.unbanUser(user);
  await audit(req, { action: 'admin.user.unbanned', targetType: 'user', targetId: user.id });
  res.json({ user: await users.serializeAdminUser(updated) });
}

/** DELETE /users/:id/sessions — signs the user out everywhere. */
export async function revokeSessions(req: Request, res: Response) {
  const user = await target(req);
  users.assertNotSelf(req.auth!.user, user, 'Use Settings → Security to manage your own sessions');
  assertMayManage(req, user);
  await deleteUserSessions(user.id);
  await audit(req, { action: 'admin.user.sessions_revoked', targetType: 'user', targetId: user.id });
  res.status(204).end();
}

/** POST /users/:id/impersonate — signs the admin in as another user for support; the admin's own session is kept aside. */
export async function impersonate(req: Request, res: Response) {
  const user = await target(req);
  users.assertNotSelf(req.auth!.user, user, "You can't impersonate yourself");
  assertMayManage(req, user);
  if (user.role === 'admin') throw forbidden("Administrators can't be impersonated", 'CANNOT_IMPERSONATE_ADMIN');
  if (user.bannedAt) throw badRequest('Suspended users cannot be impersonated', 'USER_BANNED');

  const admin = req.auth!;
  const { token, session } = await createSession(req, user.id, { impersonatorId: admin.user.id });
  setImpersonatorCookie(res, admin.token);
  setSessionCookie(res, token, session);
  await audit(req, { action: 'admin.impersonation_started', targetType: 'user', targetId: user.id });
  res.json({ redirect: '/dashboard' });
}

/** DELETE /users/:id */
export async function remove(req: Request, res: Response) {
  const user = await target(req);
  users.assertNotSelf(req.auth!.user, user, 'Delete your own account from Settings instead');
  assertMayManage(req, user);
  await users.deleteUser(user);
  await audit(req, { action: 'admin.user.deleted', targetType: 'user', targetId: user.id, metadata: { email: user.email } });
  res.status(204).end();
}
