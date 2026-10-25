import type { Request, Response } from 'express';
import type { SessionInfo } from '@kit/shared';
import { audit } from '../../../core/audit';
import { clearSessionCookie, deleteSession, deleteUserSessions, listUserSessions } from '../../../core/session';
import { notFound } from '../../../lib/errors';

/** GET /sessions — the signed-in user's own sessions (devices). */
export async function list(req: Request, res: Response) {
  const current = req.auth!.session.id;
  const rows = await listUserSessions(req.auth!.user.id);
  const sessions: SessionInfo[] = rows
    .filter((s) => !s.pending && !s.impersonatorId)
    .map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      current: s.id === current,
    }));
  res.json({ sessions });
}

/** DELETE /sessions — signs out every other session. */
export async function revokeOthers(req: Request, res: Response) {
  await deleteUserSessions(req.auth!.user.id, req.auth!.session.id);
  await audit(req, { action: 'auth.sessions_revoked', metadata: { scope: 'others' } });
  res.status(204).end();
}

/** DELETE /sessions/:id */
export async function revoke(req: Request, res: Response) {
  const sessions = await listUserSessions(req.auth!.user.id);
  const target = sessions.find((s) => s.id === req.params.id);
  if (!target) throw notFound('Session not found');
  await deleteSession(target.id);
  await audit(req, { action: 'auth.session_revoked', targetType: 'session', targetId: target.id });
  if (target.id === req.auth!.session.id) clearSessionCookie(res);
  res.status(204).end();
}
