import { Router } from 'express';
import { farmRouter } from './farm.routes';
import { organizationRouter } from './organization.routes';

/** The tenant core's routes: /api/farms and /api/organizations. */
export const router = Router();

router.use('/farms', farmRouter);
router.use('/organizations', organizationRouter);
