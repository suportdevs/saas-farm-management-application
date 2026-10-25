import { Router } from 'express';
import { adminOrganizationListQuerySchema } from '@kit/shared';
import { requirePlatform, requireRole, validate } from '../../../core';
import * as organizations from '../controllers/organization.controller';

/** Client organizations, mounted at /api/admin/organizations. Their farms are listed under /admin/farms?organizationId=. */
export const organizationRouter = Router();
organizationRouter.use(requireRole('admin'));

organizationRouter.get('/', requirePlatform('platform.tenants.view'), validate(adminOrganizationListQuerySchema, 'query'), organizations.list);
