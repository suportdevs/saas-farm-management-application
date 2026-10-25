import { Router } from 'express';
import { addOrgMemberSchema, createOrganizationSchema, updateOrganizationSchema, updateOrgMemberSchema } from '@kit/shared';
import { limiter, requireAuth, validate } from '../../../core';
import * as orgs from '../controllers/organization.controller';
import { requireOrg } from '../middleware/org-access.middleware';

/** Mounted at /api/organizations. */
export const organizationRouter = Router();

const createLimiter = limiter({ name: 'org-create', windowMs: 60 * 60 * 1000, limit: 20 });

organizationRouter.use(requireAuth);

organizationRouter.get('/', orgs.list);
organizationRouter.post('/', createLimiter, validate(createOrganizationSchema), orgs.create);
organizationRouter.get('/:org', requireOrg(), orgs.show);
organizationRouter.patch('/:org', requireOrg({ manage: true }), validate(updateOrganizationSchema), orgs.update);
organizationRouter.delete('/:org', requireOrg({ owner: true }), orgs.remove);

// Role rules (only owners manage owners, last owner stays) are checked in the service.
organizationRouter.post('/:org/members', requireOrg({ manage: true }), validate(addOrgMemberSchema), orgs.addMember);
organizationRouter.patch('/:org/members/:userId', requireOrg({ manage: true }), validate(updateOrgMemberSchema), orgs.updateMember);
organizationRouter.delete('/:org/members/:userId', requireOrg(), orgs.removeMember);
