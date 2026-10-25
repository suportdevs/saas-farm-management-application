import { Router } from 'express';
import { createPlanSchema, updatePlanSchema } from '@kit/shared';
import { requirePlatform, requireRole, validate } from '../../../core';
import * as plans from '../controllers/plan.controller';

/** Subscription plans, mounted at /api/admin/plans. */
export const planRouter = Router();
planRouter.use(requireRole('admin'));

const canManage = requirePlatform('platform.plans.manage');

// Every staff member can read plans (tenant and billing screens show them).
planRouter.get('/', plans.list);
planRouter.post('/', canManage, validate(createPlanSchema), plans.create);
planRouter.get('/:id', plans.show);
planRouter.patch('/:id', canManage, validate(updatePlanSchema), plans.update);
planRouter.post('/:id/archive', canManage, plans.archive);
planRouter.post('/:id/restore', canManage, plans.restore);
planRouter.delete('/:id', canManage, plans.remove);
