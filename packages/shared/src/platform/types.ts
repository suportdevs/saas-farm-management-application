import type { FarmType } from '../farms/schemas';
import type { PlanId } from '../subscriptions/plans';
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
