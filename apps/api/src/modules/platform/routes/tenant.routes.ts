import { Router } from 'express';
import {
  adminAddMemberSchema,
  adminCreateFarmSchema,
  adminEntitlementsSchema,
  adminExtendTrialSchema,
  adminFarmListQuerySchema,
  adminMoveFarmSchema,
  adminInvoiceListQuerySchema,
  adminSetPlanSchema,
  adminSubscriptionListQuerySchema,
  adminSuspendFarmSchema,
  adminTransferOwnershipSchema,
  adminUpdateMemberSchema,
  manualInvoiceSchema,
  manualPaymentSchema,
  quickPaymentSchema,
} from '@kit/shared';
import { requirePlatform, requireRole, validate } from '../../../core';
import * as billing from '../controllers/billing.controller';
import * as team from '../controllers/team.controller';
import * as tenants from '../controllers/tenant.controller';

/** Tenants, mounted at /api/admin/farms. */
export const tenantRouter = Router();
tenantRouter.use(requireRole('admin'));

// ─── All tenants (declared before the /:id routes) ───────────────

tenantRouter.get('/stats', requirePlatform('platform.stats.view'), tenants.stats);
tenantRouter.get('/', requirePlatform('platform.tenants.view'), validate(adminFarmListQuerySchema, 'query'), tenants.list);
tenantRouter.post('/', requirePlatform('platform.tenants.create'), validate(adminCreateFarmSchema), tenants.create);
tenantRouter.get('/subscriptions', requirePlatform('platform.billing.view'), validate(adminSubscriptionListQuerySchema, 'query'), billing.subscriptions);
tenantRouter.get('/invoices', requirePlatform('platform.billing.view'), validate(adminInvoiceListQuerySchema, 'query'), billing.invoices);

// ─── One tenant ──────────────────────────────────────────────────

tenantRouter.get('/:id', requirePlatform('platform.tenants.view'), tenants.show);
tenantRouter.patch('/:id/plan', requirePlatform('platform.billing.manage'), validate(adminSetPlanSchema), tenants.setPlan);
tenantRouter.post('/:id/trial', requirePlatform('platform.billing.manage'), validate(adminExtendTrialSchema), tenants.extendTrial);
tenantRouter.post('/:id/suspend', requirePlatform('platform.tenants.suspend'), validate(adminSuspendFarmSchema), tenants.suspend);
tenantRouter.post('/:id/unsuspend', requirePlatform('platform.tenants.suspend'), tenants.unsuspend);
tenantRouter.delete('/:id', requirePlatform('platform.tenants.delete'), tenants.remove);

// ─── One tenant: the client's team ───────────────────────────────

const canManageTeam = requirePlatform('platform.tenants.manage');
tenantRouter.get('/:id/team', requirePlatform('platform.tenants.view'), team.show);
tenantRouter.post('/:id/members', canManageTeam, validate(adminAddMemberSchema), team.addMember);
tenantRouter.patch('/:id/members/:userId', canManageTeam, validate(adminUpdateMemberSchema), team.updateMemberRole);
tenantRouter.delete('/:id/members/:userId', canManageTeam, team.removeMemberFromTeam);
tenantRouter.post('/:id/owner', canManageTeam, validate(adminTransferOwnershipSchema), team.transferOwner);
tenantRouter.patch('/:id/organization', canManageTeam, validate(adminMoveFarmSchema), team.moveToOrganization);
tenantRouter.post('/:id/invitations/:invitationId/resend', canManageTeam, team.resend);
tenantRouter.delete('/:id/invitations/:invitationId', canManageTeam, team.revoke);

// ─── One tenant: deal & manual invoices ──────────────────────────

tenantRouter.get('/:id/entitlements', requirePlatform('platform.tenants.view'), billing.entitlements);
tenantRouter.patch('/:id/entitlements', requirePlatform('platform.billing.manage'), validate(adminEntitlementsSchema), billing.updateEntitlements);
tenantRouter.get('/:id/invoices', requirePlatform('platform.billing.view'), billing.tenantInvoices);
tenantRouter.post('/:id/invoices', requirePlatform('platform.billing.manage'), validate(manualInvoiceSchema), billing.createInvoice);
tenantRouter.get('/:id/invoices/:invoiceId', requirePlatform('platform.billing.view'), billing.showInvoice);
tenantRouter.post('/:id/invoices/:invoiceId/void', requirePlatform('platform.billing.manage'), billing.voidInvoice);
tenantRouter.post('/:id/invoices/:invoiceId/payments', requirePlatform('platform.billing.manage'), validate(manualPaymentSchema), billing.recordPayment);
tenantRouter.delete('/:id/invoices/:invoiceId/payments/:paymentId', requirePlatform('platform.billing.manage'), billing.deletePayment);
// Money already received, no invoice yet: issue a paid invoice in one step.
tenantRouter.post('/:id/payments', requirePlatform('platform.billing.manage'), validate(quickPaymentSchema), billing.quickPayment);
