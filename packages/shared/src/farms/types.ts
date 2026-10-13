import type { FarmRole, Permission } from './access';
import type { AreaUnit, MilkUnit, UnitSystem, WeightUnit } from './geo';
import type { FarmType } from './schemas';
import type { PlanId } from '../subscriptions/plans';
import type { FarmUsage, SubscriptionSnapshot } from '../subscriptions/types';

export interface FarmSummary {
  id: string;
  name: string;
  slug: string;
  type: FarmType;
  country: string;
  role: FarmRole;
  planId: PlanId;
  memberCount: number;
  suspended: boolean;
}

export interface FarmProfile {
  id: string;
  name: string;
  slug: string;
  type: FarmType;
  description: string | null;
  country: string;
  region: string | null;
  city: string | null;
  address: string | null;
  postalCode: string | null;
  timezone: string;
  currency: string;
  locale: string;
  unitSystem: UnitSystem;
  milkUnit: MilkUnit;
  weightUnit: WeightUnit;
  areaUnit: AreaUnit;
  totalArea: number | null;
  herdSize: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  registrationNumber: string | null;
  taxId: string | null;
  fiscalYearStartMonth: number;
  goals: string[];
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
}

/**
 * GET /farms/:farm — everything a farm workspace needs. The farms module
 * provides the core; the subscriptions module contributes the plan snapshot.
 */
export interface FarmContext extends SubscriptionSnapshot {
  farm: FarmProfile;
  membership: { role: FarmRole; title: string | null; permissions: Permission[] };
  usage: FarmUsage;
}

export interface FarmMember {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: FarmRole;
  title: string | null;
  joinedAt: string;
  lastActiveAt: string | null;
}

export interface FarmInvitation {
  id: string;
  email: string;
  role: FarmRole;
  title: string | null;
  invitedBy: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface InvitationPreview {
  farm: { name: string; slug: string; type: FarmType; country: string };
  email: string;
  role: FarmRole;
  invitedBy: string | null;
}

export interface FarmActivityEntry {
  id: string;
  action: string;
  actor: { id: string; name: string; email: string } | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
