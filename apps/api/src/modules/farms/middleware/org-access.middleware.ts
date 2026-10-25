import type { NextFunction, Request, Response } from 'express';
import { canManageOrg, type OrgRole } from '@kit/shared';
import { forbidden, notFound, unauthorized } from '../../../core';
import type { Organization } from '../models';
import { findOrganization, orgRoleOf } from '../services/organization.service';

export interface OrgAccess {
  organization: Organization;
  role: OrgRole;
}

/** Organization context set by `requireOrg`. */
export const getOrg = (res: Response) => res.locals.org as OrgAccess;

/**
 * Resolves `:org` and requires the signed-in user to belong to it. `manage`
 * also requires the owner or admin role. Non-members get a 404.
 */
export function requireOrg(opts: { manage?: boolean; owner?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || req.auth.session.pending) throw unauthorized();
    const organization = await findOrganization(String(req.params.org));
    const role = organization ? await orgRoleOf(organization.id, req.auth.user.id) : null;
    if (!organization || !role) throw notFound('Organization not found', 'ORGANIZATION_NOT_FOUND');
    if (opts.owner && role !== 'owner') throw forbidden('Only organization owners can do that', 'OWNER_REQUIRED');
    if (opts.manage && !canManageOrg(role)) throw forbidden('Only organization owners and admins can do that', 'ORG_ROLE_REQUIRED');
    res.locals.org = { organization, role } satisfies OrgAccess;
    next();
  };
}
