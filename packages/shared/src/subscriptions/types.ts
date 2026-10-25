import type { BillingInterval, Capability, Plan, PlanId, PlanLimits } from './plans';

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

/** A plan as customers see it (GET /billing/plans, the billing page). */
export interface PublicPlan extends Omit<Plan, 'isPublic' | 'archived' | 'sortOrder'> {
  /** Whether self-serve checkout is set up for each interval. */
  checkout: Partial<Record<BillingInterval, boolean>>;
}

/** A plan as the platform team manages it (Admin → Plans). */
export interface AdminPlan extends Plan {
  stripePrices: Partial<Record<BillingInterval, string | null>>;
  /** Farms whose subscription row points at this plan. */
  subscriberCount: number;
  /** The free plan and the trial plan can't be archived or deleted. */
  locked: 'free' | 'trial' | null;
  createdAt: string | null;
  updatedAt: string | null;
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
