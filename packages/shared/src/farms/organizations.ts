/**
 * Organizations: the client (a company, co-op or family business) that owns
 * one or more farms. Each farm (tenant) still has its own subscription and team.
 *
 *   owner   full control of every farm in the organization (acts as farm owner)
 *   admin   runs every farm in the organization (acts as farm manager)
 *   member  belongs to the organization; farm access comes from farm teams
 */
import { z } from 'zod';
import type { FarmRole } from './access';

export const ORG_ROLES = ['owner', 'admin', 'member'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_INFO: Record<OrgRole, { label: string; description: string }> = {
  owner: { label: 'Owner', description: 'Full control of the organization and all of its farms.' },
  admin: { label: 'Admin', description: 'Creates farms and manages every farm as a manager.' },
  member: { label: 'Member', description: 'Belongs to the organization; farm access comes from each farm’s team.' },
};

/** The farm role an organization role gives on every farm of the organization (null = none). */
export const ORG_FARM_ROLE: Record<OrgRole, FarmRole | null> = {
  owner: 'owner',
  admin: 'manager',
  member: null,
};

/** Organization roles that may create farms and manage members. */
export const canManageOrg = (role: OrgRole | null | undefined) => role === 'owner' || role === 'admin';

// ─── Schemas ─────────────────────────────────────────────────────

export const organizationNameSchema = z.string().trim().min(2, 'Enter a name of at least 2 characters').max(100);

export const createOrganizationSchema = z.object({ name: organizationNameSchema });
export const updateOrganizationSchema = z.object({ name: organizationNameSchema });

export const addOrgMemberSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address')),
  role: z.enum(ORG_ROLES).default('member'),
});
export const updateOrgMemberSchema = z.object({ role: z.enum(ORG_ROLES) });

// ─── Types ───────────────────────────────────────────────────────

export interface OrganizationRef {
  id: string;
  name: string;
}

/** GET /organizations — the organizations the user belongs to. */
export interface OrganizationSummary extends OrganizationRef {
  role: OrgRole;
  farmCount: number;
  memberCount: number;
  createdAt: string;
}

export interface OrganizationMember {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: OrgRole;
  joinedAt: string;
}

/** A farm as the organization page lists it. */
export interface OrganizationFarm {
  id: string;
  name: string;
  slug: string;
  country: string;
  type: string;
  suspended: boolean;
  planId: string;
  planName: string;
  memberCount: number;
  createdAt: string;
}

/** GET /organizations/:org */
export interface OrganizationDetail {
  organization: OrganizationRef & { createdAt: string };
  role: OrgRole;
  farms: OrganizationFarm[];
  members: OrganizationMember[];
}
