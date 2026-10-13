import type { NextFunction, Request, Response } from 'express';
import { eq, inArray } from 'drizzle-orm';
import {
  isPlanId,
  PLANS,
  type BillingInterval,
  type Capability,
  type FarmSubscription,
  type PlanId,
  type PlanLimits,
  type SubscriptionSnapshot,
} from '@kit/shared';
import { AppError, db } from '../../core';
import { getFarm } from '../farms';
import { trialPlan } from './config';
import { farmSubscriptions, type FarmSubscriptionRow } from './schema';

const DAY = 24 * 60 * 60 * 1000;

/** Stripe statuses that keep the paid plan active. */
export const ENTITLED_STATUSES = ['active', 'trialing', 'past_due'];

type Row = FarmSubscriptionRow | undefined;

function paidPlan(row: Row, now: Date): PlanId | null {
  if (!row || !isPlanId(row.plan) || row.plan === 'free') return null;
  if (!row.status || !ENTITLED_STATUSES.includes(row.status)) return null;
  // Manual (invoiced) plans lapse at the end of the agreed period.
  if (row.source === 'manual' && row.currentPeriodEnd && row.currentPeriodEnd <= now) return null;
  return row.plan;
}

/** The subscription as it applies right now: paid plan, else trial, else free. A missing row means free. */
export function subscriptionOf(row: Row, now = new Date()): FarmSubscription {
  const paid = paidPlan(row, now);
  const onTrial = !paid && !!row?.trialEndsAt && row.trialEndsAt > now;
  const planId: PlanId = paid ?? (onTrial ? trialPlan : 'free');
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
    planName: PLANS[planId].name,
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

export function snapshotOf(row: Row): SubscriptionSnapshot {
  const subscription = subscriptionOf(row);
  const plan = PLANS[subscription.planId];
  return { subscription, limits: plan.limits, capabilities: [...plan.capabilities] };
}

/** The plan in effect for a farm. */
export const planOf = async (farmId: string) => PLANS[subscriptionOf(await findSubscription(farmId)).planId];

const LIMIT_LABELS: Record<keyof PlanLimits, string> = { animals: 'animals', members: 'team members' };

/**
 * Throws 402 when adding `adding` more of a resource would exceed the plan.
 *   await assertWithinLimit(farm.id, 'animals', currentCount);
 */
export async function assertWithinLimit(farmId: string, resource: keyof PlanLimits, current: number, adding = 1) {
  const plan = await planOf(farmId);
  const max = plan.limits[resource];
  if (max !== null && current + adding > max) {
    throw new AppError(
      402,
      'PLAN_LIMIT_REACHED',
      `Your ${plan.name} plan includes up to ${max.toLocaleString('en')} ${LIMIT_LABELS[resource]}. Upgrade to add more.`,
    );
  }
}

/** Requires the farm's plan to include a capability. Use after `requireFarm()`. */
export function requireCapability(capability: Capability) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    const plan = await planOf(getFarm(res).farm.id);
    if (!plan.capabilities.includes(capability)) {
      throw new AppError(402, 'PLAN_UPGRADE_REQUIRED', `This feature isn't included in the ${plan.name} plan. Upgrade to unlock it.`);
    }
    next();
  };
}
