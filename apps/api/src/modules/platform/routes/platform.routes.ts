import { Router } from 'express';
import { organizationRouter } from './organization.routes';
import { planRouter } from './plan.routes';
import { tenantRouter } from './tenant.routes';

/** The operator console, mounted at /api/admin. */
export const router = Router();

router.use('/farms', tenantRouter);
router.use('/plans', planRouter);
router.use('/organizations', organizationRouter);
