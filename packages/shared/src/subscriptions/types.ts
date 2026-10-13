import type { BillingInterval, Capability, PlanId, PlanLimits } from './plans';

export type SubscriptionState = 'free' | 'trialing' | 'active' | 'past_due' | 'canceled';

export interface FarmSubscription {
  /** The plan in effect right now (trial and expiry already applied). */
  planId: PlanId;
  planName: string;
  state: SubscriptionState;
  /** "stripe" (self-serve) or "manual" (invoiced by sales). */
  source: 'stripe' | 'manual' | null;
  interval: BillingInterval | null;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Current consumption of plan-limited resources. */
export interface FarmUsage {
  animals: number;
  members: number;
}

export interface PublicPlan {
  id: PlanId;
  name: string;
  tagline: string;
  prices: Partial<Record<BillingInterval, number>>;
  custom: boolean;
  highlighted: boolean;
  limits: PlanLimits;
  features: string[];
  /** Whether self-serve checkout is set up for each interval. */
  checkout: Partial<Record<BillingInterval, boolean>>;
}

export interface FarmInvoice {
  id: string;
  number: string | null;
  status: string | null;
  total: number;
  currency: string;
  createdAt: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
}

export interface BillingOverview {
  enabled: boolean;
  subscription: FarmSubscription;
  usage: FarmUsage;
  limits: PlanLimits;
  plans: PublicPlan[];
  hasBillingAccount: boolean;
}

/** What the subscriptions module adds to a farm workspace. */
export interface SubscriptionSnapshot {
  subscription: FarmSubscription;
  limits: PlanLimits;
  capabilities: Capability[];
}
