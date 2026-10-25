import { Router } from 'express';
import {
  adminCreateFarmSchema,
  adminEntitlementsSchema,
  adminExtendTrialSchema,
  adminFarmListQuerySchema,
  adminInvoiceListQuerySchema,
  adminSetPlanSchema,
  adminSubscriptionListQuerySchema,
  adminSuspendFarmSchema,
  manualInvoiceSchema,
  manualPaymentSchema,
} from '@kit/shared';
import { requirePlatform, requireRole, validate } from '../../../core';
import * as billing from '../controllers/billing.controller';
import * as tenants from '../controllers/tenant.controller';

/** Mounted at /api/admin/farms. */
export const router = Router();
router.use(requireRole('admin'));

// ─── All tenants (declared before the /:id routes) ───────────────

router.get('/stats', requirePlatform('platform.stats.view'), tenants.stats);
router.get('/', requirePlatform('platform.tenants.view'), validate(adminFarmListQuerySchema, 'query'), tenants.list);
router.post('/', requirePlatform('platform.tenants.create'), validate(adminCreateFarmSchema), tenants.create);
router.get('/subscriptions', requirePlatform('platform.billing.view'), validate(adminSubscriptionListQuerySchema, 'query'), billing.subscriptions);
router.get('/invoices', requirePlatform('platform.billing.view'), validate(adminInvoiceListQuerySchema, 'query'), billing.invoices);

// ─── One tenant ──────────────────────────────────────────────────

router.get('/:id', requirePlatform('platform.tenants.view'), tenants.show);
router.patch('/:id/plan', requirePlatform('platform.billing.manage'), validate(adminSetPlanSchema), tenants.setPlan);
router.post('/:id/trial', requirePlatform('platform.billing.manage'), validate(adminExtendTrialSchema), tenants.extendTrial);
router.post('/:id/suspend', requirePlatform('platform.tenants.suspend'), validate(adminSuspendFarmSchema), tenants.suspend);
router.post('/:id/unsuspend', requirePlatform('platform.tenants.suspend'), tenants.unsuspend);
router.delete('/:id', requirePlatform('platform.tenants.delete'), tenants.remove);

// ─── One tenant: deal & manual invoices ──────────────────────────

router.get('/:id/entitlements', requirePlatform('platform.tenants.view'), billing.entitlements);
router.patch('/:id/entitlements', requirePlatform('platform.billing.manage'), validate(adminEntitlementsSchema), billing.updateEntitlements);
router.get('/:id/invoices', requirePlatform('platform.billing.view'), billing.tenantInvoices);
router.post('/:id/invoices', requirePlatform('platform.billing.manage'), validate(manualInvoiceSchema), billing.createInvoice);
router.get('/:id/invoices/:invoiceId', requirePlatform('platform.billing.view'), billing.showInvoice);
router.post('/:id/invoices/:invoiceId/void', requirePlatform('platform.billing.manage'), billing.voidInvoice);
router.post('/:id/invoices/:invoiceId/payments', requirePlatform('platform.billing.manage'), validate(manualPaymentSchema), billing.recordPayment);
router.delete('/:id/invoices/:invoiceId/payments/:paymentId', requirePlatform('platform.billing.manage'), billing.deletePayment);
