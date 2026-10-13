export type BillingInterval = 'month' | 'year';

export interface PublicPlan {
  id: string;
  name: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  currency: string;
  prices: Partial<Record<BillingInterval, { amount: number; available: boolean }>>;
}

export interface PlansResponse {
  plans: PublicPlan[];
  enabled: boolean;
}

export interface SubscriptionResponse {
  plan: { id: string; name: string };
  subscription: {
    status: string;
    interval: BillingInterval | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: string | null;
  } | null;
  enabled: boolean;
}

export const formatPrice = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: amount % 100 ? 2 : 0 }).format(
    amount / 100,
  );
