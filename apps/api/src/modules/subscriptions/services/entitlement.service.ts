import { eq, inArray } from 'drizzle-orm';
import {
  CAPABILITIES,
  FREE_PLAN_ID,
  type BillingInterval,
  type Capability,
  type FarmSubscription,
  type PlanId,
  type PlanLimits,
  type SubscriptionSnapshot,
} from '@kit/shared';
import { AppError, db } from '../../../core';
import { farmSubscriptions, type FarmSubscriptionRow } from '../models';
import { getPlan, planExists, trialPlan } from './plan.service';

const DAY = 24 * 60 * 60 * 1000;

/** Stripe statuses that keep the paid plan active. */
export const ENTITLED_STATUSES = ['active', 'trialing', 'past_due'];

type Row = FarmSubscriptionRow | undefined;

function paidPlan(row: Row, now: Date): PlanId | null {
  if (!row || !planExists(row.plan) || row.plan === FREE_PLAN_ID) return null;
  if (!row.status || !ENTITLED_STATUSES.includes(row.status)) return null;
  // Manual (invoiced) plans lapse at the end of the agreed period.
  if (row.source === 'manual' && row.currentPeriodEnd && row.currentPeriodEnd <= now) return null;
  return row.plan;
}

/** The subscription as it applies right now: paid plan, else trial, else free. A missing row means free. */
export function subscriptionOf(row: Row, now = new Date()): FarmSubscription {
  const paid = paidPlan(row, now);
  const onTrial = !paid && !!row?.trialEndsAt && row.trialEndsAt > now;
  const planId: PlanId = paid ?? (onTrial ? trialPlan() : FREE_PLAN_ID);
  const state: FarmSubscription['state'] = paid
    ? row!.status === 'past_due'
      ? 'past_due'
      : row!.status === 'trialing'
        ? 'trialing'
        : 'active'
    : onTrial
      ? 'trialing'
      : row?.status === 'canceled'
        ? 'canceled'
        : 'free';
  return {
    planId,
    planName: getPlan(planId).name,
    state,
    source: paid ? ((row!.source as 'stripe' | 'manual' | null) ?? 'stripe') : null,
    interval: paid ? ((row!.interval as BillingInterval | null) ?? null) : null,
    trialEndsAt: row?.trialEndsAt?.toISOString() ?? null,
    trialDaysLeft: onTrial ? Math.max(0, Math.ceil((row!.trialEndsAt!.getTime() - now.getTime()) / DAY)) : null,
    currentPeriodEnd: row?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: paid ? row!.cancelAtPeriodEnd : false,
  };
}

export async function findSubscription(farmId: string): Promise<Row> {
  const [row] = await db.select().from(farmSubscriptions).where(eq(farmSubscriptions.farmId, farmId)).limit(1);
  return row;
}

export async function findSubscriptions(farmIds: string[]): Promise<Map<string, FarmSubscriptionRow>> {
  if (!farmIds.length) return new Map();
  const rows = await db.select().from(farmSubscriptions).where(inArray(farmSubscriptions.farmId, farmIds));
  return new Map(rows.map((r) => [r.farmId, r]));
}

const LIMIT_KEYS: (keyof PlanLimits)[] = ['animals', 'members'];

/** Stored limit overrides, minus unknown keys: a number replaces the plan's limit, null lifts it. */
export function limitOverridesOf(row: Row): Partial<Record<keyof PlanLimits, number | null>> {
  const raw = row?.limitOverrides ?? {};
  return Object.fromEntries(
    LIMIT_KEYS.filter((k) => k in raw && (raw[k] === null || Number.isInteger(raw[k]))).map((k) => [k, raw[k] as number | null]),
  );
}

export function capabilityOverridesOf(row: Row): Partial<Record<Capability, boolean>> {
  const raw = row?.capabilityOverrides ?? {};
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => (CAPABILITIES as readonly string[]).includes(k) && typeof v === 'boolean'));
}

/**
 * What a farm actually gets: its plan, with any per-tenant deal applied
 * (custom limits, modules added or removed by the platform team).
 */
export function entitlementsOf(row: Row) {
  const subscription = subscriptionOf(row);
  const plan = getPlan(subscription.planId);
  const limits: PlanLimits = { ...plan.limits, ...limitOverridesOf(row) };
  const overrides = capabilityOverridesOf(row);
  const capabilities = CAPABILITIES.filter((c) => overrides[c] ?? plan.capabilities.includes(c));
  return { subscription, plan, limits, capabilities };
}

export function snapshotOf(row: Row): SubscriptionSnapshot {
  const { subscription, limits, capabilities } = entitlementsOf(row);
  return { subscription, limits, capabilities };
}

/** The plan in effect for a farm. */
export const planOf = async (farmId: string) => getPlan(subscriptionOf(await findSubscription(farmId)).planId);

const LIMIT_LABELS: Record<keyof PlanLimits, string> = { animals: 'animals', members: 'team members' };

/**
 * Throws 402 when adding `adding` more of a resource would exceed the farm's limit (plan or deal).
 *   await assertWithinLimit(farm.id, 'animals', currentCount);
 */
export async function assertWithinLimit(farmId: string, resource: keyof PlanLimits, current: number, adding = 1) {
  const { plan, limits } = entitlementsOf(await findSubscription(farmId));
  const max = limits[resource];
  if (max !== null && current + adding > max) {
    throw new AppError(
      402,
      'PLAN_LIMIT_REACHED',
      `Your ${plan.name} plan includes up to ${max.toLocaleString('en')} ${LIMIT_LABELS[resource]}. Upgrade to add more.`,
    );
  }
}
