import { Router, type Request } from 'express';
import { and, count, desc, eq, ilike, inArray, not, or, sql, type SQL } from 'drizzle-orm';
import {
  adminCreateFarmSchema,
  adminEntitlementsSchema,
  adminInvoiceListQuerySchema,
  adminSubscriptionListQuerySchema,
  manualInvoiceSchema,
  manualPaymentSchema,
  monthlyValue,
  type AdminEntitlementsInput,
  type AdminInvoiceListQuery,
  type AdminSubscriptionListQuery,
  type BillingInterval,
  type PlatformSubscription,
} from '@kit/shared';
import { audit, badRequest, db, notFound, requirePlatform, users, validate } from '../../core';
import { createFarmForClient, farmMembers, farms, findFarm, type Farm } from '../farms';
import {
  createManualInvoice,
  deleteManualPayment,
  entitlementsFor,
  entitlementsOf,
  farmSubscriptions,
  findSubscription,
  getManualInvoice,
  listManualInvoices,
  recordManualPayment,
  setEntitlements,
  setManualPlan,
  subscriptionOf,
  unpaidByFarm,
  unpaidFarmIds,
  voidManualInvoice,
} from '../subscriptions';

/**
 * Manual tenant management for the platform team (mounted under /api/admin/farms,
 * before the /:id routes):
 *
 *   POST   /                                  create a tenant for a client (owner joins or is invited)
 *   GET    /subscriptions                     every tenant's subscription, deal and unpaid invoices
 *   GET    /invoices                          every manual invoice (?status=open|overdue|paid|void)
 *   GET    /:id/entitlements                  the tenant's deal: custom limits and modules
 *   PATCH  /:id/entitlements
 *   GET    /:id/invoices                      the tenant's manual invoices
 *   POST   /:id/invoices                      issue one
 *   POST   /:id/invoices/:invoiceId/void
 *   POST   /:id/invoices/:invoiceId/payments  record a payment (paid in full → plan extended)
 *   DELETE /:id/invoices/:invoiceId/payments/:paymentId
 */
export const billingRouter = Router();

const s = farmSubscriptions;
const event = (farm: Farm) => ({ targetType: 'farm', targetId: farm.id });

async function loadFarm(req: Request): Promise<Farm> {
  const farm = await findFarm(String(req.params.id));
  if (!farm) throw notFound('Farm not found');
  return farm;
}

// ─── Tenants ─────────────────────────────────────────────────────

billingRouter.post('/', requirePlatform('platform.tenants.create'), validate(adminCreateFarmSchema), async (req, res) => {
  const input = req.body as Parameters<typeof createFarmForClient>[1] & { planId?: string; currentPeriodEnd?: string | null };
  const { farm, owner, invited } = await createFarmForClient(req.auth!.user, input);
  if (input.planId && input.planId !== 'free') {
    await setManualPlan(farm, input.planId as never, input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null);
  }
  await audit(req, {
    action: 'admin.farm.created',
    ...event(farm),
    metadata: { name: farm.name, ownerEmail: input.ownerEmail, invited, planId: input.planId ?? null },
  });
  res.status(201).json({ farm: { id: farm.id, slug: farm.slug, name: farm.name }, owner: owner && { id: owner.id, email: owner.email }, invited });
});

// ─── Subscriptions ───────────────────────────────────────────────

/** SQL mirrors of `subscriptionOf()` (farms without a row are free). */
const entitled = sql`coalesce((coalesce(${s.plan}, 'free') <> 'free' and ${s.status} in ('active','trialing','past_due')
  and not (${s.source} = 'manual' and ${s.currentPeriodEnd} is not null and ${s.currentPeriodEnd} <= now())), false)`;
const onTrial = sql`(not ${entitled} and coalesce(${s.trialEndsAt} > now(), false))`;

const stateWhere: Record<NonNullable<AdminSubscriptionListQuery['state']>, SQL> = {
  trialing: sql`(${onTrial} or (${entitled} and ${s.status} = 'trialing'))`,
  active: sql`(${entitled} and ${s.status} = 'active')`,
  past_due: sql`(${entitled} and ${s.status} = 'past_due')`,
  canceled: sql`(not ${entitled} and not ${onTrial} and ${s.status} = 'canceled')`,
  free: sql`(not ${entitled} and not ${onTrial} and ${s.status} is distinct from 'canceled')`,
};

const owners = db
  .select({ farmId: farmMembers.farmId, id: users.id, name: users.name, email: users.email })
  .from(farmMembers)
  .innerJoin(users, eq(users.id, farmMembers.userId))
  .where(eq(farmMembers.role, 'owner'))
  .as('owner');

const memberCounts = db.select({ farmId: farmMembers.farmId, total: count().as('member_total') }).from(farmMembers).groupBy(farmMembers.farmId).as('members');

billingRouter.get('/subscriptions', requirePlatform('platform.billing.view'), validate(adminSubscriptionListQuerySchema, 'query'), async (req, res) => {
  const { page, pageSize, q, plan, state, source, billing } = req.query as unknown as AdminSubscriptionListQuery;
  const filters: SQL[] = [];
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    filters.push(or(ilike(farms.name, pattern), ilike(farms.slug, pattern), ilike(owners.email, pattern))!);
  }
  if (plan) filters.push(plan === 'free' ? sql`not ${entitled}` : and(entitled, eq(s.plan, plan))!);
  if (state) filters.push(stateWhere[state]);
  if (source === 'none') filters.push(not(entitled));
  else if (source) filters.push(and(entitled, eq(s.source, source))!);
  if (billing) filters.push(inArray(farms.id, unpaidFarmIds(billing === 'overdue')));
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .selectDistinctOn([farms.createdAt, farms.id], {
        farm: farms,
        sub: s,
        ownerId: owners.id,
        ownerName: owners.name,
        ownerEmail: owners.email,
        members: memberCounts.total,
      })
      .from(farms)
      .leftJoin(s, eq(s.farmId, farms.id))
      .leftJoin(owners, eq(owners.farmId, farms.id))
      .leftJoin(memberCounts, eq(memberCounts.farmId, farms.id))
      .where(where)
      .orderBy(desc(farms.createdAt), farms.id)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: sql<number>`count(distinct ${farms.id})`.mapWith(Number) })
      .from(farms)
      .leftJoin(s, eq(s.farmId, farms.id))
      .leftJoin(owners, eq(owners.farmId, farms.id))
      .where(where),
  ]);
  const unpaid = await unpaidByFarm(rows.map((r) => r.farm.id));
  const subscriptions: PlatformSubscription[] = rows.map(({ farm, sub, ownerId, ownerName, ownerEmail, members }) => {
    const row = sub ?? undefined;
    const subscription = subscriptionOf(row);
    const { limits } = entitlementsOf(row);
    const paying = subscription.state === 'active' || subscription.state === 'past_due';
    return {
      farm: { id: farm.id, name: farm.name, slug: farm.slug, country: farm.country, suspended: Boolean(farm.suspendedAt) },
      owner: ownerId ? { id: ownerId, name: ownerName!, email: ownerEmail! } : null,
      subscription,
      mrr: paying ? monthlyValue(subscription.planId, (subscription.interval as BillingInterval | null) ?? 'month') : 0,
      limits,
      hasOverrides: Object.keys(row?.limitOverrides ?? {}).length + Object.keys(row?.capabilityOverrides ?? {}).length > 0,
      unpaid: unpaid.get(farm.id) ?? { count: 0, overdue: 0, balances: [] },
      memberCount: Number(members ?? 0),
    };
  });
  res.json({ subscriptions, pagination: { page, pageSize, total: total?.value ?? 0 } });
});

// ─── Invoices (all tenants) ──────────────────────────────────────

billingRouter.get('/invoices', requirePlatform('platform.billing.view'), validate(adminInvoiceListQuerySchema, 'query'), async (req, res) => {
  const { page, pageSize, q, status } = req.query as unknown as AdminInvoiceListQuery;
  const { invoices, total } = await listManualInvoices({ q, status, limit: pageSize, offset: (page - 1) * pageSize });
  res.json({ invoices, pagination: { page, pageSize, total } });
});

// ─── One tenant: deal & invoices ─────────────────────────────────

billingRouter.get('/:id/entitlements', requirePlatform('platform.tenants.view'), async (req, res) => {
  const farm = await loadFarm(req);
  const row = await findSubscription(farm.id);
  const { limits, capabilities, plan } = entitlementsOf(row);
  res.json({ entitlements: await entitlementsFor(farm.id), effective: { planId: plan.id, limits, capabilities } });
});

billingRouter.patch('/:id/entitlements', requirePlatform('platform.billing.manage'), validate(adminEntitlementsSchema), async (req, res) => {
  const farm = await loadFarm(req);
  const before = await entitlementsFor(farm.id);
  const entitlements = await setEntitlements(farm.id, req.body as AdminEntitlementsInput);
  await audit(req, { action: 'admin.farm.entitlements_changed', ...event(farm), metadata: { before, after: entitlements } });
  const { limits, capabilities, plan } = entitlementsOf(await findSubscription(farm.id));
  res.json({ entitlements, effective: { planId: plan.id, limits, capabilities } });
});

billingRouter.get('/:id/invoices', requirePlatform('platform.billing.view'), async (req, res) => {
  const farm = await loadFarm(req);
  res.json((await listManualInvoices({ farmId: farm.id, limit: 200, offset: 0 })).invoices);
});

billingRouter.post('/:id/invoices', requirePlatform('platform.billing.manage'), validate(manualInvoiceSchema), async (req, res) => {
  const farm = await loadFarm(req);
  const invoice = await createManualInvoice(farm, req.auth!.user, req.body);
  await audit(req, {
    action: 'admin.farm.invoice_created',
    ...event(farm),
    metadata: { invoiceId: invoice.id, number: invoice.number, amount: invoice.amount, currency: invoice.currency },
  });
  res.status(201).json({ invoice });
});

billingRouter.get('/:id/invoices/:invoiceId', requirePlatform('platform.billing.view'), async (req, res) => {
  const farm = await loadFarm(req);
  res.json({ invoice: await getManualInvoice(farm.id, String(req.params.invoiceId)) });
});

billingRouter.post('/:id/invoices/:invoiceId/void', requirePlatform('platform.billing.manage'), async (req, res) => {
  const farm = await loadFarm(req);
  const invoice = await voidManualInvoice(farm, String(req.params.invoiceId));
  await audit(req, { action: 'admin.farm.invoice_voided', ...event(farm), metadata: { invoiceId: invoice.id, number: invoice.number } });
  res.json({ invoice });
});

billingRouter.post('/:id/invoices/:invoiceId/payments', requirePlatform('platform.billing.manage'), validate(manualPaymentSchema), async (req, res) => {
  const farm = await loadFarm(req);
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
});

billingRouter.delete('/:id/invoices/:invoiceId/payments/:paymentId', requirePlatform('platform.billing.manage'), async (req, res) => {
  const farm = await loadFarm(req);
  const { payment, invoice } = await deleteManualPayment(farm, String(req.params.invoiceId), String(req.params.paymentId));
  if (!payment) throw badRequest('Payment not found');
  await audit(req, { action: 'admin.farm.payment_deleted', ...event(farm), metadata: { invoiceId: invoice.id, number: invoice.number, amount: payment.amount } });
  res.json({ invoice });
});
