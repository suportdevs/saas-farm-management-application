import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  isPlanId,
  type AdminEntitlementsInput,
  type FarmInvoice,
  type InvoiceStatus,
  type ManualInvoice,
  type ManualPayment,
  type PaymentMethod,
  type PlanId,
  type TenantEntitlements,
} from '@kit/shared';
import { badRequest, db, notFound, users, type User } from '../../../core';
import { farms, type Farm } from '../../farms';
import { capabilityOverridesOf, findSubscription, limitOverridesOf } from './entitlement.service';
import { farmSubscriptions, manualInvoices, manualPayments, type ManualInvoiceRow, type ManualPaymentRow } from '../models';
import { setManualPlan } from './subscription.service';

const today = () => new Date().toISOString().slice(0, 10);

// ─── Per-tenant deals ────────────────────────────────────────────

export async function entitlementsFor(farmId: string): Promise<TenantEntitlements> {
  const row = await findSubscription(farmId);
  return { limits: limitOverridesOf(row), capabilities: capabilityOverridesOf(row), notes: row?.dealNotes ?? null };
}

/** Replaces a tenant's limit and module overrides (on top of whatever plan they're on). */
export async function setEntitlements(farmId: string, input: AdminEntitlementsInput) {
  const limits: Record<string, number | null> = {};
  const l = input.limits ?? {};
  if (l.unlimitedMembers) limits.members = null;
  else if (typeof l.members === 'number') limits.members = l.members;
  if (l.unlimitedAnimals) limits.animals = null;
  else if (typeof l.animals === 'number') limits.animals = l.animals;
  const values = { limitOverrides: limits, capabilityOverrides: input.capabilities ?? {}, dealNotes: input.notes ?? null };
  await db
    .insert(farmSubscriptions)
    .values({ farmId, ...values })
    .onConflictDoUpdate({ target: farmSubscriptions.farmId, set: values });
  return entitlementsFor(farmId);
}

// ─── Invoices ────────────────────────────────────────────────────

function statusOf(row: ManualInvoiceRow, paid: number): InvoiceStatus {
  if (row.voidedAt) return 'void';
  if (paid >= row.amount) return 'paid';
  return row.dueAt < today() ? 'overdue' : 'open';
}

/** SQL mirror of statusOf for filters (paidAt is set once paid in full). */
const statusWhere: Record<InvoiceStatus, SQL> = {
  void: isNotNull(manualInvoices.voidedAt),
  paid: and(isNull(manualInvoices.voidedAt), isNotNull(manualInvoices.paidAt))!,
  overdue: and(isNull(manualInvoices.voidedAt), isNull(manualInvoices.paidAt), sql`${manualInvoices.dueAt} < current_date`)!,
  open: and(isNull(manualInvoices.voidedAt), isNull(manualInvoices.paidAt), sql`${manualInvoices.dueAt} >= current_date`)!,
};

const serializePayment = (p: ManualPaymentRow, names: Map<string, string>): ManualPayment => ({
  id: p.id,
  amount: p.amount,
  method: p.method as PaymentMethod,
  reference: p.reference,
  paidAt: p.paidAt,
  notes: p.notes,
  recordedBy: p.recordedById ? (names.get(p.recordedById) ?? null) : null,
  createdAt: p.createdAt.toISOString(),
});

async function hydrate(rows: { invoice: ManualInvoiceRow; farm: { id: string; name: string; slug: string } }[]): Promise<ManualInvoice[]> {
  if (!rows.length) return [];
  const payments = await db
    .select()
    .from(manualPayments)
    .where(inArray(manualPayments.invoiceId, rows.map((r) => r.invoice.id)))
    .orderBy(manualPayments.paidAt, manualPayments.createdAt);
  const userIds = [...new Set([...rows.map((r) => r.invoice.createdById), ...payments.map((p) => p.recordedById)].filter((v): v is string => !!v))];
  const names = new Map(
    userIds.length ? (await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u.name]) : [],
  );
  return rows.map(({ invoice: i, farm }) => {
    const own = payments.filter((p) => p.invoiceId === i.id);
    const paid = own.reduce((sum, p) => sum + p.amount, 0);
    return {
      id: i.id,
      number: i.number,
      farm,
      description: i.description,
      amount: i.amount,
      paid,
      balance: i.voidedAt ? 0 : Math.max(0, i.amount - paid),
      currency: i.currency,
      status: statusOf(i, paid),
      issuedAt: i.issuedAt,
      dueAt: i.dueAt,
      planId: isPlanId(i.planId) ? i.planId : null,
      periodEnd: i.periodEnd,
      notes: i.notes,
      payments: own.map((p) => serializePayment(p, names)),
      createdBy: i.createdById ? (names.get(i.createdById) ?? null) : null,
      createdAt: i.createdAt.toISOString(),
      voidedAt: i.voidedAt?.toISOString() ?? null,
      paidAt: i.paidAt?.toISOString() ?? null,
    };
  });
}

const farmRef = { id: farms.id, name: farms.name, slug: farms.slug };

export async function listManualInvoices(opts: { farmId?: string; q?: string; status?: InvoiceStatus; limit: number; offset: number }) {
  const filters: SQL[] = [];
  if (opts.farmId) filters.push(eq(manualInvoices.farmId, opts.farmId));
  if (opts.status) filters.push(statusWhere[opts.status]);
  if (opts.q) {
    const pattern = `%${opts.q.replace(/[%_\\]/g, '\\$&')}%`;
    filters.push(or(ilike(manualInvoices.number, pattern), ilike(manualInvoices.description, pattern), ilike(farms.name, pattern))!);
  }
  const where = filters.length ? and(...filters) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select({ invoice: manualInvoices, farm: farmRef })
      .from(manualInvoices)
      .innerJoin(farms, eq(farms.id, manualInvoices.farmId))
      .where(where)
      .orderBy(desc(manualInvoices.issuedAt), desc(manualInvoices.createdAt))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ value: count() }).from(manualInvoices).innerJoin(farms, eq(farms.id, manualInvoices.farmId)).where(where),
  ]);
  return { invoices: await hydrate(rows), total: total?.value ?? 0 };
}

async function loadInvoice(farmId: string, invoiceId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) throw notFound('Invoice not found');
  const [row] = await db
    .select({ invoice: manualInvoices, farm: farmRef })
    .from(manualInvoices)
    .innerJoin(farms, eq(farms.id, manualInvoices.farmId))
    .where(and(eq(manualInvoices.id, invoiceId), eq(manualInvoices.farmId, farmId)))
    .limit(1);
  if (!row) throw notFound('Invoice not found');
  return row;
}

export const getManualInvoice = async (farmId: string, invoiceId: string) => (await hydrate([await loadInvoice(farmId, invoiceId)]))[0]!;

/** INV-<year>-<5 digits>, sequential per year. */
async function nextNumber(year: number) {
  const prefix = `INV-${year}-`;
  const [row] = await db
    .select({ last: sql<string | null>`max(${manualInvoices.number})` })
    .from(manualInvoices)
    .where(ilike(manualInvoices.number, `${prefix}%`));
  const seq = row?.last ? Number(row.last.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

export async function createManualInvoice(
  farm: Farm,
  staff: User,
  input: { description: string; amount: number; currency: string; issuedAt?: string; dueAt: string; planId?: PlanId | null; periodEnd?: string | null; notes?: string },
) {
  const issuedAt = input.issuedAt ?? today();
  if (input.dueAt < issuedAt) throw badRequest('The due date is before the issue date', 'INVALID_DUE_DATE');
  if (input.planId && input.planId !== 'free' && !input.periodEnd) {
    throw badRequest('Set the paid-through date for the plan this invoice pays for', 'PERIOD_END_REQUIRED');
  }
  // Two invoices issued at the same moment may race for a number: retry on the unique index.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await db
        .insert(manualInvoices)
        .values({
          farmId: farm.id,
          number: await nextNumber(Number(issuedAt.slice(0, 4))),
          description: input.description,
          amount: input.amount,
          currency: input.currency,
          issuedAt,
          dueAt: input.dueAt,
          planId: input.planId ?? null,
          periodEnd: input.periodEnd ?? null,
          notes: input.notes || null,
          createdById: staff.id,
        })
        .returning();
      return getManualInvoice(farm.id, row!.id);
    } catch (err) {
      if ((err as { cause?: { code?: string } }).cause?.code !== '23505' || attempt === 4) throw err;
    }
  }
  throw new Error('unreachable');
}

/**
 * Records a payment. When the invoice is paid in full it is marked paid and,
 * if it pays for a plan, the tenant's manual plan runs through its period end.
 */
export async function recordManualPayment(
  farm: Farm,
  staff: User,
  invoiceId: string,
  input: { amount: number; method: PaymentMethod; reference?: string; paidAt?: string; notes?: string },
) {
  const before = await getManualInvoice(farm.id, invoiceId);
  if (before.status === 'void') throw badRequest('This invoice was voided', 'INVOICE_VOID');
  if (before.status === 'paid') throw badRequest('This invoice is already paid', 'INVOICE_PAID');
  if (input.amount > before.balance) throw badRequest(`That is more than the balance due`, 'OVERPAYMENT');
  await db.insert(manualPayments).values({
    invoiceId,
    amount: input.amount,
    method: input.method,
    reference: input.reference || null,
    paidAt: input.paidAt ?? today(),
    notes: input.notes || null,
    recordedById: staff.id,
  });
  const paidInFull = before.paid + input.amount >= before.amount;
  let planApplied: { planId: PlanId; periodEnd: string } | null = null;
  if (paidInFull) {
    await db.update(manualInvoices).set({ paidAt: new Date() }).where(eq(manualInvoices.id, invoiceId));
    if (before.planId && before.planId !== 'free' && before.periodEnd) {
      // Paid through the end of that day; never shortens a longer period already granted.
      const end = new Date(`${before.periodEnd}T23:59:59.999Z`);
      const current = await findSubscription(farm.id);
      const keep = current?.source === 'manual' && current.plan === before.planId && current.currentPeriodEnd && current.currentPeriodEnd > end;
      if (!keep) await setManualPlan(farm, before.planId, end);
      planApplied = { planId: before.planId, periodEnd: before.periodEnd };
    }
  }
  return { invoice: await getManualInvoice(farm.id, invoiceId), paidInFull, planApplied };
}

/** Removes a payment recorded by mistake. The invoice reopens; plan changes stay (adjust them by hand). */
export async function deleteManualPayment(farm: Farm, invoiceId: string, paymentId: string) {
  await loadInvoice(farm.id, invoiceId);
  const [deleted] = await db
    .delete(manualPayments)
    .where(and(eq(manualPayments.id, paymentId), eq(manualPayments.invoiceId, invoiceId)))
    .returning();
  if (!deleted) throw notFound('Payment not found');
  const after = await getManualInvoice(farm.id, invoiceId);
  if (after.paid < after.amount) await db.update(manualInvoices).set({ paidAt: null }).where(eq(manualInvoices.id, invoiceId));
  return { payment: deleted, invoice: await getManualInvoice(farm.id, invoiceId) };
}

/** Voids an unpaid invoice (kept for the record, no longer owed). */
export async function voidManualInvoice(farm: Farm, invoiceId: string) {
  const invoice = await getManualInvoice(farm.id, invoiceId);
  if (invoice.status === 'void') return invoice;
  if (invoice.paid > 0) throw badRequest('Remove the recorded payments before voiding this invoice', 'INVOICE_HAS_PAYMENTS');
  await db.update(manualInvoices).set({ voidedAt: new Date() }).where(eq(manualInvoices.id, invoiceId));
  return getManualInvoice(farm.id, invoiceId);
}

/** Open manual invoices per farm, for the subscription list. */
export async function unpaidByFarm(farmIds: string[]) {
  const map = new Map<string, { count: number; overdue: number; balances: { currency: string; amount: number }[] }>();
  if (!farmIds.length) return map;
  const { invoices } = await listManualInvoicesFor(farmIds);
  for (const i of invoices) {
    if (i.status !== 'open' && i.status !== 'overdue') continue;
    const entry = map.get(i.farm.id) ?? { count: 0, overdue: 0, balances: [] };
    entry.count++;
    if (i.status === 'overdue') entry.overdue++;
    const balance = entry.balances.find((b) => b.currency === i.currency);
    if (balance) balance.amount += i.balance;
    else entry.balances.push({ currency: i.currency, amount: i.balance });
    map.set(i.farm.id, entry);
  }
  return map;
}

async function listManualInvoicesFor(farmIds: string[]) {
  const rows = await db
    .select({ invoice: manualInvoices, farm: farmRef })
    .from(manualInvoices)
    .innerJoin(farms, eq(farms.id, manualInvoices.farmId))
    .where(and(inArray(manualInvoices.farmId, farmIds), isNull(manualInvoices.voidedAt), isNull(manualInvoices.paidAt)));
  return { invoices: await hydrate(rows) };
}

/** Farm ids with open (or only overdue) manual invoices — for list filters. */
export const unpaidFarmIds = (overdueOnly: boolean) =>
  db
    .selectDistinct({ farmId: manualInvoices.farmId })
    .from(manualInvoices)
    .where(overdueOnly ? statusWhere.overdue : or(statusWhere.open, statusWhere.overdue));

/** The tenant's own billing page lists manual invoices next to Stripe ones. */
export async function manualInvoicesForTenant(farmId: string): Promise<FarmInvoice[]> {
  const { invoices } = await listManualInvoices({ farmId, limit: 50, offset: 0 });
  return invoices.map((i) => ({
    id: i.id,
    number: i.number,
    status: i.status,
    total: i.amount,
    currency: i.currency.toLowerCase(),
    createdAt: new Date(`${i.issuedAt}T00:00:00Z`).toISOString(),
    hostedUrl: null,
    pdfUrl: null,
  }));
}
