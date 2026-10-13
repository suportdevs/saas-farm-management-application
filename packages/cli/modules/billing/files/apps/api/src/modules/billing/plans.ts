import { config } from './config';

export type BillingInterval = 'month' | 'year';

export interface Plan {
  /** Stable id stored on subscriptions and used by `requirePlan()`. */
  id: string;
  name: string;
  description: string;
  features: string[];
  /** Display prices in the smallest currency unit. Stripe holds the real price. */
  prices: Partial<Record<BillingInterval, { priceId: string | undefined; amount: number }>>;
  highlighted?: boolean;
}

export const currency = 'usd';

/**
 * Your plans. Edit freely — `free` must stay first and has no prices.
 * Create a matching Product + recurring Prices in Stripe and set the price ids in .env.
 */
export const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'For individuals getting started.',
    features: ['1 project', 'Community support', 'Basic analytics'],
    prices: {},
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For professionals who need more.',
    features: ['Unlimited projects', 'Priority email support', 'Advanced analytics', 'API access'],
    prices: {
      month: { priceId: config.STRIPE_PRICE_PRO_MONTHLY, amount: 1900 },
      year: { priceId: config.STRIPE_PRICE_PRO_YEARLY, amount: 19000 },
    },
    highlighted: true,
  },
  {
    id: 'team',
    name: 'Team',
    description: 'For growing teams that collaborate.',
    features: ['Everything in Pro', 'Up to 25 members', 'SSO-ready audit log', 'Dedicated support'],
    prices: {
      month: { priceId: config.STRIPE_PRICE_TEAM_MONTHLY, amount: 4900 },
      year: { priceId: config.STRIPE_PRICE_TEAM_YEARLY, amount: 49000 },
    },
  },
];

export const freePlan = plans[0]!;

export const findPlan = (id: string) => plans.find((p) => p.id === id);

export function planForPrice(priceId: string): { plan: Plan; interval: BillingInterval } | null {
  for (const plan of plans) {
    for (const [interval, price] of Object.entries(plan.prices)) {
      if (price?.priceId === priceId) return { plan, interval: interval as BillingInterval };
    }
  }
  return null;
}

/** Plans as exposed to the browser (no Stripe ids). */
export const publicPlans = () =>
  plans.map(({ prices, ...plan }) => ({
    ...plan,
    currency,
    prices: Object.fromEntries(
      Object.entries(prices).map(([interval, p]) => [interval, { amount: p!.amount, available: Boolean(p!.priceId) }]),
    ),
  }));
