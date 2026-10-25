import type { Request, Response } from 'express';
import type { AdminEntitlementsInput, AdminInvoiceListQuery, AdminSubscriptionListQuery } from '@kit/shared';
import { audit, badRequest } from '../../../core';
import type { Farm } from '../../farms';
import {
  createManualInvoice,
  deleteManualPayment,
  entitlementsFor,
  entitlementsOf,
  findSubscription,
  getManualInvoice,
  listManualInvoices,
  recordManualPayment,
  setEntitlements,
  voidManualInvoice,
} from '../../subscriptions';
import { listSubscriptions } from '../services/subscription-report.service';
import { findTenant } from '../services/tenant.service';

const event = (farm: Farm) => ({ targetType: 'farm', targetId: farm.id });

/** GET /subscriptions — every tenant's subscription, deal and unpaid invoices. */
export async function subscriptions(req: Request, res: Response) {
  res.json(await listSubscriptions(req.query as unknown as AdminSubscriptionListQuery));
}

/** GET /invoices — every manual invoice (?status=open|overdue|paid|void). */
export async function invoices(req: Request, res: Response) {
  const { page, pageSize, q, status } = req.query as unknown as AdminInvoiceListQuery;
  const { invoices, total } = await listManualInvoices({ q, status, limit: pageSize, offset: (page - 1) * pageSize });
  res.json({ invoices, pagination: { page, pageSize, total } });
}

/** GET /:id/entitlements — the tenant's deal: custom limits and modules. */
export async function entitlements(req: Request, res: Response) {
  const farm = await findTenant(String(req.params.id));
  const row = await findSubscription(farm.id);
  const { limits, capabilities, plan } = entitlementsOf(row);
  res.json({ entitlements: await entitlementsFor(farm.id), effective: { planId: plan.id, limits, capabilities } });
}

/** PATCH /:id/entitlements */
export async function updateEntitlements(req: Request, res: Response) {
  const farm = await findTenant(String(req.params.id));
  const before = await entitlementsFor(farm.id);
  const entitlements = await setEntitlements(farm.id, req.body as AdminEntitlementsInput);
  await audit(req, { action: 'admin.farm.entitlements_changed', ...event(farm), metadata: { before, after: entitlements } });
  const { limits, capabilities, plan } = entitlementsOf(await findSubscription(farm.id));
  res.json({ entitlements, effective: { planId: plan.id, limits, capabilities } });
}

/** GET /:id/invoices — the tenant's manual invoices. */
export async function tenantInvoices(req: Request, res: Response) {
  const farm = await findTenant(String(req.params.id));
  res.json((await listManualInvoices({ farmId: farm.id, limit: 200, offset: 0 })).invoices);
}

/** POST /:id/invoices */
export async function createInvoice(req: Request, res: Response) {
  const farm = await findTenant(String(req.params.id));
  const invoice = await createManualInvoice(farm, req.auth!.user, req.body);
  await audit(req, {
    action: 'admin.farm.invoice_created',
    ...event(farm),
    metadata: { invoiceId: invoice.id, number: invoice.number, amount: invoice.amount, currency: invoice.currency },
  });
  res.status(201).json({ invoice });
}

/** GET /:id/invoices/:invoiceId */
export async function showInvoice(req: Request, res: Response) {
  const farm = await findTenant(String(req.params.id));
  res.json({ invoice: await getManualInvoice(farm.id, String(req.params.invoiceId)) });
}

/** POST /:id/invoices/:invoiceId/void */
export async function voidInvoice(req: Request, res: Response) {
  const farm = await findTenant(String(req.params.id));
  const invoice = await voidManualInvoice(farm, String(req.params.invoiceId));
  await audit(req, { action: 'admin.farm.invoice_voided', ...event(farm), metadata: { invoiceId: invoice.id, number: invoice.number } });
  res.json({ invoice });
}

/** POST /:id/invoices/:invoiceId/payments — paid in full → plan extended. */
export async function recordPayment(req: Request, res: Response) {
  const farm = await findTenant(String(req.params.id));
  const { invoice, paidInFull, planApplied } = await recordManualPayment(farm, req.auth!.user, String(req.params.invoiceId), req.body);
  const amount = (req.body as { amount: number }).amount;
  await audit(req, {
    action: 'admin.farm.payment_recorded',
    ...event(farm),
    metadata: { invoiceId: invoice.id, number: invoice.number, amount, currency: invoice.currency, paidInFull, planApplied },
  });
  // The tenant's own activity log shows it like a Stripe payment.
  await audit(req, {
    action: 'farm.payment_succeeded',
    actorId: null,
    ...event(farm),
    metadata: { amount: new Intl.NumberFormat('en', { style: 'currency', currency: invoice.currency }).format(amount / 100), invoice: invoice.number },
  });
  res.status(201).json({ invoice, paidInFull, planApplied });
}

/** DELETE /:id/invoices/:invoiceId/payments/:paymentId */
export async function deletePayment(req: Request, res: Response) {
  const farm = await findTenant(String(req.params.id));
  const { payment, invoice } = await deleteManualPayment(farm, String(req.params.invoiceId), String(req.params.paymentId));
  if (!payment) throw badRequest('Payment not found');
  await audit(req, { action: 'admin.farm.payment_deleted', ...event(farm), metadata: { invoiceId: invoice.id, number: invoice.number, amount: payment.amount } });
  res.json({ invoice });
}
