import { Router } from 'express';
import { requirePlatform, requireRole } from '../../../core';
import * as system from '../controllers/system.controller';
import { organizationRouter } from './organization.routes';
import { planRouter } from './plan.routes';
import { tenantRouter } from './tenant.routes';

/** The operator console, mounted at /api/admin. */
export const router = Router();

router.use('/farms', tenantRouter);
router.use('/plans', planRouter);
router.use('/organizations', organizationRouter);
router.get('/system', requireRole('admin'), requirePlatform('platform.stats.view'), system.info);
