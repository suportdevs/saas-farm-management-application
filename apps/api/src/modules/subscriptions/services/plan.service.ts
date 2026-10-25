import { asc, count, eq } from 'drizzle-orm';
import {
  CAPABILITIES,
  DEFAULT_PLAN_LIST,
  DEFAULT_PLANS,
  FREE_PLAN_ID,
  type AdminPlan,
  type BillingInterval,
  type Capability,
  type CreatePlanData,
  type Plan,
  type PlanId,
  type PublicPlan,
  type UpdatePlanData,
} from '@kit/shared';
import { badRequest, conflict, db, logger, notFound, type User } from '../../../core';
import { billingEnabled, config, envStripePrices } from '../config';
import { farmSubscriptions, manualInvoices, plans, type PlanRow } from '../models';

/**
 * Plans are read on every request (entitlements, limits), so the API keeps
 * them in memory: loaded at startup, reloaded after every change and once a
 * minute (so several API instances stay in step). Until the first load the
 * built-in defaults are used.
 */
let cache = new Map<PlanId, PlanRow>();
let loaded = false;

const toPlan = (row: PlanRow): Plan => ({
  id: row.id,
  name: row.name,
  tagline: row.tagline,
  prices: {
    ...(row.priceMonth !== null ? { month: row.priceMonth } : {}),
    ...(row.priceYear !== null ? { year: row.priceYear } : {}),
  },
  custom: row.custom,
  highlighted: row.highlighted,
  limits: row.limits,
  capabilities: CAPABILITIES.filter((c) => row.capabilities.includes(c)),
  features: row.features,
  isPublic: row.isPublic,
  selfServe: row.selfServe,
  archived: Boolean(row.archivedAt),
  sortOrder: row.sortOrder,
});

export async function loadPlans() {
  const rows = await db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.name));
  cache = new Map(rows.map((r) => [r.id, r]));
  loaded = true;
  if (!cache.has(FREE_PLAN_ID)) logger.warn('The "free" plan is missing from the plans table — run the migrations');
}

/** Reloads the cache in the background every minute. */
export function watchPlans() {
  const timer = setInterval(() => void loadPlans().catch((err) => logger.error({ err }, 'Failed to reload plans')), 60_000);
  timer.unref();
}

// ─── Lookups (synchronous, from the cache) ───────────────────────

/** Every plan, in display order (archived ones included). */
export function allPlans(): Plan[] {
  return loaded ? [...cache.values()].map(toPlan) : DEFAULT_PLAN_LIST;
}

export const planExists = (id: string | null | undefined) => Boolean(id) && (loaded ? cache.has(id!) : id! in DEFAULT_PLANS);

/** A plan by code. Unknown codes fall back to the free plan, so a farm is never left without one. */
export function getPlan(id: PlanId): Plan {
  const row = loaded ? (cache.get(id) ?? cache.get(FREE_PLAN_ID)) : undefined;
  return row ? toPlan(row) : (DEFAULT_PLANS[id] ?? DEFAULT_PLANS[FREE_PLAN_ID]!);
}

/** The plan new farms trial (FARM_TRIAL_PLAN), or free when it's missing or archived. */
export function trialPlan(): PlanId {
  const id = config.FARM_TRIAL_PLAN;
  if (!planExists(id) || getPlan(id).archived) return FREE_PLAN_ID;
  return id;
}

/** The Stripe price for a plan and interval: the plan's own, else the STRIPE_PRICE_* env vars of the original plans. */
export function stripePriceOf(planId: PlanId, interval: BillingInterval): string | null {
  const row = cache.get(planId);
  const own = interval === 'month' ? row?.stripePriceMonth : row?.stripePriceYear;
  return own || envStripePrices[planId]?.[interval] || null;
}

/** Which plan and interval a Stripe price belongs to (webhooks). */
export function planForPrice(priceId: string): { planId: PlanId; interval: BillingInterval } | null {
  for (const plan of allPlans()) {
    for (const interval of ['month', 'year'] as const) {
      if (stripePriceOf(plan.id, interval) === priceId) return { planId: plan.id, interval };
    }
  }
  return null;
}

/** Plans customers can see and pick: public and not archived. */
export function publicPlans(): PublicPlan[] {
  return allPlans()
    .filter((p) => p.isPublic && !p.archived)
    .map(({ isPublic: _public, archived: _archived, sortOrder: _order, ...p }) => ({
      ...p,
      checkout: {
        month: billingEnabled() && p.selfServe && Boolean(stripePriceOf(p.id, 'month')),
        year: billingEnabled() && p.selfServe && Boolean(stripePriceOf(p.id, 'year')),
      },
    }));
}

// ─── Admin → Plans ───────────────────────────────────────────────

const lockOf = (id: PlanId): AdminPlan['locked'] => (id === FREE_PLAN_ID ? 'free' : id === trialPlan() ? 'trial' : null);

async function subscriberCounts(): Promise<Map<string, number>> {
  const rows = await db.select({ plan: farmSubscriptions.plan, total: count() }).from(farmSubscriptions).groupBy(farmSubscriptions.plan);
  return new Map(rows.map((r) => [r.plan, r.total]));
}

const toAdminPlan = (row: PlanRow, counts: Map<string, number>): AdminPlan => ({
  ...toPlan(row),
  stripePrices: { month: row.stripePriceMonth, year: row.stripePriceYear },
  subscriberCount: counts.get(row.id) ?? 0,
  locked: lockOf(row.id),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function listAdminPlans(): Promise<AdminPlan[]> {
  const [rows, counts] = await Promise.all([db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.name)), subscriberCounts()]);
  return rows.map((r) => toAdminPlan(r, counts));
}

async function findRow(id: string): Promise<PlanRow> {
  const [row] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  if (!row) throw notFound('Plan not found', 'PLAN_NOT_FOUND');
  return row;
}

export async function getAdminPlan(id: string): Promise<AdminPlan> {
  return toAdminPlan(await findRow(id), await subscriberCounts());
}

type PlanValues = Partial<typeof plans.$inferInsert>;

/** Maps validated input onto columns (only the fields that were sent). */
function valuesOf(input: UpdatePlanData): PlanValues {
  const v: PlanValues = {};
  if (input.name !== undefined) v.name = input.name;
  if (input.tagline !== undefined) v.tagline = input.tagline;
  if (input.prices?.month !== undefined) v.priceMonth = input.prices.month;
  if (input.prices?.year !== undefined) v.priceYear = input.prices.year;
  if (input.custom !== undefined) v.custom = input.custom;
  if (input.highlighted !== undefined) v.highlighted = input.highlighted;
  if (input.isPublic !== undefined) v.isPublic = input.isPublic;
  if (input.selfServe !== undefined) v.selfServe = input.selfServe;
  if (input.limits !== undefined) v.limits = input.limits;
  if (input.capabilities !== undefined) v.capabilities = [...new Set(input.capabilities)] as Capability[];
  if (input.features !== undefined) v.features = input.features;
  if (input.stripePrices?.month !== undefined) v.stripePriceMonth = input.stripePrices.month;
  if (input.stripePrices?.year !== undefined) v.stripePriceYear = input.stripePrices.year;
  if (input.sortOrder !== undefined) v.sortOrder = input.sortOrder;
  return v;
}

/** Rules a plan must follow once the change is applied. */
function assertValid(id: PlanId, plan: PlanRow) {
  const hasPrice = plan.priceMonth !== null || plan.priceYear !== null;
  if (id === FREE_PLAN_ID && (hasPrice || plan.selfServe || plan.custom)) {
    throw badRequest('The free plan has no price and is never sold', 'FREE_PLAN_LOCKED');
  }
  if (plan.selfServe && !hasPrice) throw badRequest('Give the plan a monthly or yearly price to sell it online', 'PRICE_REQUIRED');
  if (plan.selfServe && plan.custom) throw badRequest('A custom-priced plan is sold by your team, not online', 'CUSTOM_NOT_SELF_SERVE');
}

export async function createPlan(actor: User, input: CreatePlanData): Promise<AdminPlan> {
  const [existing] = await db.select({ id: plans.id }).from(plans).where(eq(plans.id, input.id)).limit(1);
  if (existing) throw conflict('A plan with that code already exists', 'PLAN_EXISTS');
  const values = { id: input.id, ...valuesOf(input), name: input.name, limits: input.limits, updatedById: actor.id };
  assertValid(input.id, { priceMonth: null, priceYear: null, selfServe: false, custom: false, ...values } as PlanRow);
  const [row] = await db.insert(plans).values(values).returning();
  await loadPlans();
  return toAdminPlan(row!, new Map());
}

/** Returns the plan before and after, for the audit log. */
export async function updatePlan(actor: User, id: string, input: UpdatePlanData) {
  const before = await findRow(id);
  const values = valuesOf(input);
  assertValid(id, { ...before, ...values } as PlanRow);
  const [row] = await db
    .update(plans)
    .set({ ...values, updatedById: actor.id })
    .where(eq(plans.id, id))
    .returning();
  await loadPlans();
  return { before: toPlan(before), plan: await getAdminPlan(row!.id), changed: Object.keys(input) };
}

export async function setArchived(actor: User, id: string, archived: boolean): Promise<AdminPlan> {
  await findRow(id);
  if (archived && lockOf(id)) {
    throw badRequest(id === FREE_PLAN_ID ? 'The free plan can’t be archived' : 'New farms trial this plan — change FARM_TRIAL_PLAN first', 'PLAN_LOCKED');
  }
  await db
    .update(plans)
    .set({ archivedAt: archived ? new Date() : null, updatedById: actor.id })
    .where(eq(plans.id, id));
  await loadPlans();
  return getAdminPlan(id);
}

/** Deletes a plan nobody has ever used; otherwise archive it. */
export async function deletePlan(id: string): Promise<PlanRow> {
  const row = await findRow(id);
  if (lockOf(id)) throw badRequest('This plan can’t be deleted', 'PLAN_LOCKED');
  const [[subs], [invoices]] = await Promise.all([
    db.select({ total: count() }).from(farmSubscriptions).where(eq(farmSubscriptions.plan, id)),
    db.select({ total: count() }).from(manualInvoices).where(eq(manualInvoices.planId, id)),
  ]);
  if ((subs?.total ?? 0) + (invoices?.total ?? 0) > 0) {
    throw conflict('Farms or invoices use this plan. Archive it instead.', 'PLAN_IN_USE');
  }
  await db.delete(plans).where(eq(plans.id, id));
  await loadPlans();
  return row;
}
