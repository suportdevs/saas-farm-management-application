import { Router } from 'express';
import { checkoutSchema } from '@kit/shared';
import { forbidImpersonation, validate } from '../../../core';
import { requireFarm } from '../../farms';
import * as billing from '../controllers/billing.controller';
import * as webhook from '../controllers/webhook.controller';

/** Mounted at /api/farms — farm-scoped billing lives at /api/farms/:farm/billing. */
export const router = Router();

const canView = requireFarm('billing.view', { allowSuspended: true });
const canManage = requireFarm('billing.manage', { allowSuspended: true });

router.get('/:farm/billing', canView, billing.overview);
router.get('/:farm/billing/invoices', canView, billing.invoices);
router.post('/:farm/billing/checkout', canManage, forbidImpersonation, validate(checkoutSchema), billing.checkout);
router.post('/:farm/billing/portal', canManage, forbidImpersonation, billing.portal);

/** Mounted at /api/billing before CSRF/session middleware: Stripe signs its requests instead. */
export const webhookRouter = Router();

webhookRouter.post('/webhook', webhook.stripe);
