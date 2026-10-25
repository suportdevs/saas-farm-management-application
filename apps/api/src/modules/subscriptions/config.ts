import Stripe from 'stripe';
import { z } from 'zod';
import type { BillingInterval, PlanId } from '@kit/shared';
import { AppError, parseModuleEnv } from '../../core';

export const config = parseModuleEnv(
  'subscriptions',
  z.object({
    /** Days of the trial plan every new farm starts with (0 = no trial). */
    FARM_TRIAL_DAYS: z.coerce.number().int().min(0).max(90).default(14),
    /** Plan code new farms trial; falls back to free when that plan is missing or archived. */
    FARM_TRIAL_PLAN: z.string().trim().toLowerCase().default('pro'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_GROWTH_MONTHLY: z.string().optional(),
    STRIPE_PRICE_GROWTH_YEARLY: z.string().optional(),
    STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
    STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
  }),
);

/**
 * Stripe prices of the original plans from env vars. Plans now carry their own
 * price ids (Admin → Plans); these are only used when a plan has none set.
 */
export const envStripePrices: Partial<Record<PlanId, Partial<Record<BillingInterval, string | undefined>>>> = {
  growth: { month: config.STRIPE_PRICE_GROWTH_MONTHLY, year: config.STRIPE_PRICE_GROWTH_YEARLY },
  pro: { month: config.STRIPE_PRICE_PRO_MONTHLY, year: config.STRIPE_PRICE_PRO_YEARLY },
};

export const billingEnabled = () => Boolean(config.STRIPE_SECRET_KEY);

let client: Stripe | null = null;

/** The Stripe client. Throws a 503 until billing is configured. */
export function stripe(): Stripe {
  if (!config.STRIPE_SECRET_KEY) throw new AppError(503, 'BILLING_NOT_CONFIGURED', 'Online payments are not configured yet');
  client ??= new Stripe(config.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, appInfo: { name: 'herdsphere' } });
  return client;
}
