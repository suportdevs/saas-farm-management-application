/**
 * Subscription plans. Each farm (tenant) has its own subscription.
 *
 * Plans live in the database and are managed by the platform team
 * (Admin → Plans). DEFAULT_PLANS below are the plans every install starts
 * with: the first migration seeds them and the API falls back to them until
 * the database has been read. Stripe holds the real prices.
 *
 * Modules (capabilities) are code: a plan decides which of them a farm gets.
 */

export type PlanId = string;
export type BillingInterval = 'month' | 'year';
export const BILLING_INTERVALS = ['month', 'year'] as const;

/** Every farm falls back to this plan; it can't be archived, deleted or sold. */
export const FREE_PLAN_ID = 'free';

/** Product areas (modules) a plan can unlock. Operation modules check these. */
export const CAPABILITIES = [
  'herd',
  'milk',
  'health',
  'breeding',
  'feed',
  'products',
  'finance',
  'advanced_reports',
  'data_export',
  'api_access',
  'priority_support',
  'sso',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  herd: 'Herd',
  milk: 'Milk',
  health: 'Health',
  breeding: 'Breeding',
  feed: 'Feed',
  products: 'Products',
  finance: 'Finance',
  advanced_reports: 'Advanced reports',
  data_export: 'Data exports',
  api_access: 'API access',
  priority_support: 'Priority support',
  sso: 'Single sign-on',
};

export interface PlanLimits {
  /** Active animals on the farm. `null` = unlimited. */
  animals: number | null;
  /** Members plus pending invitations. `null` = unlimited. */
  members: number | null;
}

export interface Plan {
  /** Short code, e.g. "pro". Stored on each subscription; can't change once created. */
  id: PlanId;
  name: string;
  tagline: string;
  /** Prices in USD cents. Missing for free and custom-priced plans. */
  prices: Partial<Record<BillingInterval, number>>;
  /** Priced by sales ("Contact us"). */
  custom: boolean;
  highlighted: boolean;
  limits: PlanLimits;
  capabilities: Capability[];
  features: string[];
  /** Listed on the pricing page and the farm's billing page. */
  isPublic: boolean;
  /** Can be bought online through Stripe checkout. */
  selfServe: boolean;
  /** Archived plans keep their subscribers but can't be chosen any more. */
  archived: boolean;
  sortOrder: number;
}

/** @deprecated Use `Plan`. */
export type PlanDefinition = Plan;

const CORE: Capability[] = ['herd', 'milk', 'health', 'breeding', 'products'];

const plan = (p: Omit<Plan, 'custom' | 'highlighted' | 'isPublic' | 'selfServe' | 'archived'> & Partial<Plan>): Plan => ({
  custom: false,
  highlighted: false,
  isPublic: true,
  selfServe: false,
  archived: false,
  ...p,
});

/** The plans a new install starts with (seeded by migration 0011_plans). */
export const DEFAULT_PLANS: Record<string, Plan> = {
  free: plan({
    id: 'free',
    name: 'Starter',
    tagline: 'For smallholders getting organised.',
    prices: {},
    limits: { animals: 25, members: 2 },
    capabilities: CORE,
    features: ['Up to 25 animals', '2 team members', 'Herd register & animal profiles', 'Milk, health and breeding records', 'Mobile-friendly web app'],
    sortOrder: 0,
  }),
  growth: plan({
    id: 'growth',
    name: 'Growth',
    tagline: 'For family farms ready to grow.',
    prices: { month: 2900, year: 28800 },
    selfServe: true,
    limits: { animals: 250, members: 10 },
    capabilities: [...CORE, 'feed', 'finance', 'data_export'],
    features: ['Up to 250 animals', '10 team members', 'Feed & inventory management', 'Income, expenses & profitability', 'CSV / Excel exports', 'Email support'],
    sortOrder: 1,
  }),
  pro: plan({
    id: 'pro',
    name: 'Professional',
    tagline: 'For commercial dairy and beef operations.',
    prices: { month: 7900, year: 79200 },
    highlighted: true,
    selfServe: true,
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
    sortOrder: 2,
  }),
  enterprise: plan({
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For agri-groups, co-ops and integrators.',
    prices: {},
    custom: true,
    limits: { animals: null, members: null },
    capabilities: [...CAPABILITIES],
    features: ['Unlimited animals & members', 'Everything in Professional', 'Single sign-on (SSO)', 'Custom onboarding & data migration', 'Dedicated success manager', 'Uptime SLA'],
    sortOrder: 3,
  }),
};

export const DEFAULT_PLAN_LIST: Plan[] = Object.values(DEFAULT_PLANS);

/** Monthly equivalent in cents (yearly prices are divided by 12) — used for MRR. */
export function monthlyValue(plan: Pick<Plan, 'prices'> | undefined, interval: BillingInterval | null): number {
  const prices = plan?.prices ?? {};
  if (interval === 'year' && prices.year) return Math.round(prices.year / 12);
  return prices.month ?? 0;
}

/** A plan's display name, or its code when the plan isn't in `plans`. */
export const planName = (plans: readonly Pick<Plan, 'id' | 'name'>[], id: PlanId | null | undefined) =>
  (id && plans.find((p) => p.id === id)?.name) || id || '';
