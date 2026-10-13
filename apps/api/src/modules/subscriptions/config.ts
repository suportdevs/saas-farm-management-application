import Stripe from 'stripe';
import { z } from 'zod';
import { isPlanId, type BillingInterval, type PlanId } from '@kit/shared';
import { AppError, parseModuleEnv } from '../../core';

export const config = parseModuleEnv(
  'subscriptions',
  z.object({
    /** Days of the trial plan every new farm starts with (0 = no trial). */
    FARM_TRIAL_DAYS: z.coerce.number().int().min(0).max(90).default(14),
    FARM_TRIAL_PLAN: z.string().refine(isPlanId).default('pro'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_GROWTH_MONTHLY: z.string().optional(),
    STRIPE_PRICE_GROWTH_YEARLY: z.string().optional(),
    STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
    STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
  }),
);

export const trialPlan = config.FARM_TRIAL_PLAN as PlanId;

/** Stripe price ids per self-serve plan and interval. */
export const stripePrices: Partial<Record<PlanId, Partial<Record<BillingInterval, string | undefined>>>> = {
  growth: { month: config.STRIPE_PRICE_GROWTH_MONTHLY, year: config.STRIPE_PRICE_GROWTH_YEARLY },
  pro: { month: config.STRIPE_PRICE_PRO_MONTHLY, year: config.STRIPE_PRICE_PRO_YEARLY },
};

export function planForPrice(priceId: string): { planId: PlanId; interval: BillingInterval } | null {
  for (const [planId, intervals] of Object.entries(stripePrices)) {
    for (const [interval, id] of Object.entries(intervals ?? {})) {
      if (id && id === priceId) return { planId: planId as PlanId, interval: interval as BillingInterval };
    }
  }
  return null;
}

export const billingEnabled = () => Boolean(config.STRIPE_SECRET_KEY);

let client: Stripe | null = null;

/** The Stripe client. Throws a 503 until billing is configured. */
export function stripe(): Stripe {
  if (!config.STRIPE_SECRET_KEY) throw new AppError(503, 'BILLING_NOT_CONFIGURED', 'Online payments are not configured yet');
  client ??= new Stripe(config.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, appInfo: { name: 'herdsphere' } });
  return client;
}
