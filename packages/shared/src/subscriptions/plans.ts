/**
 * Subscription plans. Each farm (tenant) has its own subscription.
 * Display prices live here; Stripe holds the real prices (ids in the API env).
 */

export const PLAN_IDS = ['free', 'growth', 'pro', 'enterprise'] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type BillingInterval = 'month' | 'year';

/** Product areas a plan can unlock. Operation modules check these. */
export const CAPABILITIES = [
  'herd',
  'milk',
  'health',
  'breeding',
  'feed',
  'finance',
  'advanced_reports',
  'data_export',
  'api_access',
  'priority_support',
  'sso',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export interface PlanLimits {
  /** Active animals on the farm. `null` = unlimited. */
  animals: number | null;
  /** Members plus pending invitations. `null` = unlimited. */
  members: number | null;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  /** Prices in USD cents. Missing for free and custom-priced plans. */
  prices: Partial<Record<BillingInterval, number>>;
  /** Priced by sales ("Contact us"). */
  custom?: boolean;
  highlighted?: boolean;
  limits: PlanLimits;
  capabilities: readonly Capability[];
  features: string[];
}

const CORE: Capability[] = ['herd', 'milk', 'health', 'breeding'];

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Starter',
    tagline: 'For smallholders getting organised.',
    prices: {},
    limits: { animals: 25, members: 2 },
    capabilities: CORE,
    features: ['Up to 25 animals', '2 team members', 'Herd register & animal profiles', 'Milk, health and breeding records', 'Mobile-friendly web app'],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    tagline: 'For family farms ready to grow.',
    prices: { month: 2900, year: 28800 },
    limits: { animals: 250, members: 10 },
    capabilities: [...CORE, 'feed', 'finance', 'data_export'],
    features: ['Up to 250 animals', '10 team members', 'Feed & inventory management', 'Income, expenses & profitability', 'CSV / Excel exports', 'Email support'],
  },
  pro: {
    id: 'pro',
    name: 'Professional',
    tagline: 'For commercial dairy and beef operations.',
    prices: { month: 7900, year: 79200 },
    highlighted: true,
    limits: { animals: 2000, members: 50 },
    capabilities: [...CORE, 'feed', 'finance', 'data_export', 'advanced_reports', 'api_access', 'priority_support'],
    features: [
      'Up to 2,000 animals',
      '50 team members',
      'Everything in Growth',
      'Advanced analytics & benchmarks',
      'API access & integrations',
      'Priority support',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For agri-groups, co-ops and integrators.',
    prices: {},
    custom: true,
    limits: { animals: null, members: null },
    capabilities: [...CAPABILITIES],
    features: ['Unlimited animals & members', 'Everything in Professional', 'Single sign-on (SSO)', 'Custom onboarding & data migration', 'Dedicated success manager', 'Uptime SLA'],
  },
};

export const PLAN_LIST: PlanDefinition[] = PLAN_IDS.map((id) => PLANS[id]);

export const isPlanId = (v: unknown): v is PlanId => typeof v === 'string' && (PLAN_IDS as readonly string[]).includes(v);

/** Plans a customer can buy through self-serve checkout. */
export const SELF_SERVE_PLANS: PlanId[] = ['growth', 'pro'];

/** Monthly equivalent in cents (yearly prices are divided by 12) — used for MRR. */
export function monthlyValue(planId: PlanId, interval: BillingInterval | null): number {
  const prices = PLANS[planId].prices;
  if (interval === 'year' && prices.year) return Math.round(prices.year / 12);
  return prices.month ?? 0;
}
