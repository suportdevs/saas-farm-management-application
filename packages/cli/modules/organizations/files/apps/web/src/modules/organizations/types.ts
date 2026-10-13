export type OrgRole = 'owner' | 'admin' | 'member';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  role: OrgRole;
  memberCount?: number;
}

export interface OrgMember {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: OrgRole;
  joinedAt: string;
}

export interface OrgInvitation {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: string;
  createdAt: string;
}

export const roleLabels: Record<OrgRole, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };
export const canManage = (role: OrgRole) => role === 'owner' || role === 'admin';
