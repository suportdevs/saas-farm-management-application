import Stripe from 'stripe';
import { z } from 'zod';
import { AppError, parseModuleEnv } from '../../core';

export const config = parseModuleEnv(
  'billing',
  z.object({
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
    STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
    STRIPE_PRICE_TEAM_MONTHLY: z.string().optional(),
    STRIPE_PRICE_TEAM_YEARLY: z.string().optional(),
    BILLING_TRIAL_DAYS: z.coerce.number().int().min(0).default(0),
  }),
);

let client: Stripe | null = null;

export const isConfigured = () => Boolean(config.STRIPE_SECRET_KEY);

/** The Stripe client. Throws a 503 if billing isn't configured yet. */
export function stripe(): Stripe {
  if (!config.STRIPE_SECRET_KEY) {
    throw new AppError(503, 'BILLING_NOT_CONFIGURED', 'Billing is not configured yet');
  }
  client ??= new Stripe(config.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, appInfo: { name: 'saas-starter-kit' } });
  return client;
}
