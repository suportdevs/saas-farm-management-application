import type { NextFunction, Request, Response } from 'express';
import type { FarmRole, Permission } from '@kit/shared';
import { forbidden, notFound, unauthorized } from '../../core';
import type { Farm, FarmMemberRow } from './schema';
import { findMembership, touchAccess } from './service';

export interface FarmAccess {
  farm: Farm;
  member: FarmMemberRow;
  role: FarmRole;
  /** Effective permissions: role defaults → farm role overrides → member overrides. */
  permissions: Permission[];
}

/** Farm context set by `requireFarm` — use it in farm-scoped routes. */
export const getFarm = (res: Response) => res.locals.farm as FarmAccess;

/** Whether the member behind this farm request holds `permission`. */
export const hasPermission = (res: Response, permission: Permission) => getFarm(res).permissions.includes(permission);

/**
 * Resolves `:farm` (id or slug) and requires the signed-in user to be a member,
 * optionally holding a per-action permission key. Non-members get a 404 so a
 * farm's existence isn't leaked. Suspended farms are read-blocked unless `allowSuspended`.
 *
 *   router.post('/:farm/animals', requireFarm('herd.create'), handler)
 */
export function requireFarm(permission?: Permission, opts: { allowSuspended?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || req.auth.session.pending) throw unauthorized();
    const row = await findMembership(String(req.params.farm), req.auth.user.id);
    if (!row) throw notFound('Farm not found');
    if (row.farm.suspendedAt && !opts.allowSuspended) {
      throw forbidden('This farm has been suspended. Contact support to restore access.', 'FARM_SUSPENDED');
    }
    if (permission && !row.permissions.includes(permission)) {
      throw forbidden("Your role on this farm doesn't allow that", 'FARM_PERMISSION_REQUIRED');
    }
    res.locals.farm = { farm: row.farm, member: row.member, role: row.member.role, permissions: row.permissions } satisfies FarmAccess;
    // Fire and forget: remembering the last farm must never slow a request down.
    void touchAccess(row.member).catch(() => {});
    next();
  };
}
