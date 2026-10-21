import type { FarmType } from '../farms/schemas';
import type { Capability, PlanId, PlanLimits } from '../subscriptions/plans';
import type { InvoiceStatus, PaymentMethod } from './schemas';
import type { FarmSubscription } from '../subscriptions/types';

export interface PlatformFarm {
  id: string;
  name: string;
  slug: string;
  type: FarmType;
  country: string;
  city: string | null;
  subscription: FarmSubscription;
  memberCount: number;
  owner: { id: string; name: string; email: string } | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
}

export interface PlatformStats {
  farms: { total: number; new7d: number; new30d: number; trialing: number; paying: number; pastDue: number; suspended: number };
  /** Monthly recurring revenue in USD cents (self-serve + manual). */
  mrr: number;
  byPlan: { planId: PlanId; count: number }[];
  byCountry: { country: string; count: number }[];
  byType: { type: FarmType; count: number }[];
  /** Farms created per day for the last 30 days (oldest first). */
  created: { date: string; count: number }[];
}

/** Per-tenant deals on top of the plan (manual / enterprise clients). */
export interface TenantEntitlements {
  /** Limit overrides; null value = unlimited; missing key = the plan's limit. */
  limits: Partial<Record<keyof PlanLimits, number | null>>;
  /** Modules added (true) or removed (false) compared with the plan. */
  capabilities: Partial<Record<Capability, boolean>>;
  notes: string | null;
}

export interface ManualPayment {
  id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
}

/** An invoice issued by the platform team (bank transfer, cash…), outside Stripe. */
export interface ManualInvoice {
  id: string;
  number: string;
  farm: { id: string; name: string; slug: string };
  description: string;
  /** Minor units (cents). */
  amount: number;
  paid: number;
  balance: number;
  currency: string;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
  planId: PlanId | null;
  periodEnd: string | null;
  notes: string | null;
  payments: ManualPayment[];
  createdBy: string | null;
  createdAt: string;
  voidedAt: string | null;
  paidAt: string | null;
}

/** A row of the platform's subscription list: which tenant is on which plan, and how they pay. */
export interface PlatformSubscription {
  farm: { id: string; name: string; slug: string; country: string; suspended: boolean };
  owner: { id: string; name: string; email: string } | null;
  subscription: FarmSubscription;
  /** Monthly value in USD cents (0 for free / trials). */
  mrr: number;
  limits: PlanLimits;
  hasOverrides: boolean;
  /** Open manual invoices: count and the balance per currency. */
  unpaid: { count: number; overdue: number; balances: { currency: string; amount: number }[] };
  memberCount: number;
}
