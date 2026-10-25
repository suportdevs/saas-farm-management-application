import type { NextFunction, Request, Response } from 'express';
import { MODULE_CAPABILITIES, PERMISSION_MODULES, permissionBlock, type FarmRole, type Permission, type PermissionModule } from '@kit/shared';
import { AppError, forbidden, notFound, unauthorized } from '../../../core';
import type { Farm, FarmMemberRow } from '../models';
import { findMembership, touchAccess } from '../services/member.service';

export interface FarmAccess {
  farm: Farm;
  member: FarmMemberRow;
  role: FarmRole;
  /** Effective permissions: role defaults → farm role overrides → member overrides, limited to the farm's plan and enabled modules. */
  permissions: Permission[];
  /** The same before the plan and module switches — what the member may configure for others. */
  granted: Permission[];
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
 * A key is checked in this order:
 *   module switched off by the farm → 403 MODULE_DISABLED
 *   module / action not in the plan → 402 PLAN_UPGRADE_REQUIRED
 *   role and overrides don't grant it → 403 FARM_PERMISSION_REQUIRED
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
    if (permission) {
      const module = permission.split('.')[0] as PermissionModule;
      const block = permissionBlock(permission, row.gate);
      if (block === 'disabled') {
        throw forbidden(`${PERMISSION_MODULES[module].label} is switched off for this farm`, 'MODULE_DISABLED');
      }
      if (block === 'plan') {
        const what = MODULE_CAPABILITIES[module] && !row.gate.capabilities.includes(MODULE_CAPABILITIES[module]) ? PERMISSION_MODULES[module].label : 'This feature';
        throw new AppError(402, 'PLAN_UPGRADE_REQUIRED', `${what} isn't included in your plan. Upgrade to unlock it.`);
      }
      if (!row.permissions.includes(permission)) {
        throw forbidden("Your role on this farm doesn't allow that", 'FARM_PERMISSION_REQUIRED');
      }
    }
    res.locals.farm = {
      farm: row.farm,
      member: row.member,
      role: row.member.role,
      permissions: row.permissions,
      granted: row.granted,
    } satisfies FarmAccess;
    // Fire and forget: remembering the last farm must never slow a request down.
    void touchAccess(row.member).catch(() => {});
    next();
  };
}
