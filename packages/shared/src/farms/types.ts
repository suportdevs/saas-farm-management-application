import type { FarmRole, ModuleStatus, Permission, PermissionModule, PermissionOverrides, ToggleableModule } from './access';
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
  /** Set when the user has one of the farm's custom roles. */
  customRole: CustomRoleRef | null;
  planId: PlanId;
  memberCount: number;
  suspended: boolean;
  /** The user's effective permissions on this farm. */
  permissions: Permission[];
  /** Per module: on, not in the plan, or switched off by the farm. */
  modules: Record<PermissionModule, ModuleStatus>;
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
  /** Modules the farm switched off. */
  disabledModules: ToggleableModule[];
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
  membership: { role: FarmRole; customRole: CustomRoleRef | null; title: string | null; permissions: Permission[] };
  /** What each role can do on this farm (defaults plus the farm's role overrides). */
  rolePermissions: Record<FarmRole, Permission[]>;
  /** The farm's own roles, for role pickers and the roles guide. */
  customRoles: FarmCustomRole[];
  /** Per module: on, not in the plan, or switched off by the farm. */
  modules: Record<PermissionModule, ModuleStatus>;
  usage: FarmUsage;
}

/** GET /farms/:farm/permissions — the editor for role and member permissions. */
export interface FarmPermissions {
  roles: Record<FarmRole, { permissions: Permission[]; overrides: PermissionOverrides }>;
  customRoles: FarmCustomRole[];
  members: { userId: string; role: FarmRole; customRoleId: string | null; overrides: PermissionOverrides; permissions: Permission[] }[];
}

export interface CustomRoleRef {
  id: string;
  name: string;
}

/** A role a farm defined itself, with its own per-action keys. */
export interface FarmCustomRole extends CustomRoleRef {
  description: string | null;
  permissions: Permission[];
  /** Members plus pending invitations holding the role. */
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FarmMember {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: FarmRole;
  customRole: CustomRoleRef | null;
  title: string | null;
  joinedAt: string;
  lastActiveAt: string | null;
}

export interface FarmInvitation {
  id: string;
  email: string;
  role: FarmRole;
  customRole: CustomRoleRef | null;
  title: string | null;
  invitedBy: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface InvitationPreview {
  farm: { name: string; slug: string; type: FarmType; country: string };
  email: string;
  role: FarmRole;
  customRole: CustomRoleRef | null;
  invitedBy: string | null;
}

export interface FarmActivityEntry {
  id: string;
  action: string;
  actor: { id: string; name: string; email: string } | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
