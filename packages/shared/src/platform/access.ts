/**
 * Platform (operator console) roles and per-action permissions. Only users
 * with `role: 'admin'` are platform staff; their `staffRole` decides what they
 * can do. Staff without a staffRole are super admins (e.g. from ADMIN_EMAILS).
 */

export const STAFF_ROLES = ['super_admin', 'support', 'billing', 'analyst'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_INFO: Record<StaffRole, { label: string; description: string }> = {
  super_admin: { label: 'Super admin', description: 'Everything, including managing other staff.' },
  support: { label: 'Support', description: 'Helps customers: users, tenants, suspensions and impersonation.' },
  billing: { label: 'Billing', description: 'Plans, trials and revenue for every tenant.' },
  analyst: { label: 'Analyst', description: 'Read-only access to stats, users and tenants.' },
};

export const PLATFORM_PERMISSIONS = [
  'platform.stats.view',
  'platform.users.view',
  'platform.users.update',
  'platform.users.suspend',
  'platform.users.impersonate',
  'platform.users.delete',
  'platform.tenants.view',
  'platform.tenants.suspend',
  'platform.tenants.delete',
  'platform.billing.manage',
  'platform.audit.view',
  'platform.staff.manage',
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const PLATFORM_PERMISSION_LABELS: Record<PlatformPermission, string> = {
  'platform.stats.view': 'See platform stats & revenue',
  'platform.users.view': 'See users',
  'platform.users.update': 'Edit users & verify emails',
  'platform.users.suspend': 'Suspend users & revoke sessions',
  'platform.users.impersonate': 'Sign in as a user',
  'platform.users.delete': 'Delete users',
  'platform.tenants.view': 'See tenants (farms)',
  'platform.tenants.suspend': 'Suspend & restore tenants',
  'platform.tenants.delete': 'Delete tenants',
  'platform.billing.manage': 'Assign plans & extend trials',
  'platform.audit.view': 'See the audit log',
  'platform.staff.manage': 'Manage platform staff',
};

export const STAFF_ROLE_PERMISSIONS: Record<StaffRole, readonly PlatformPermission[]> = {
  super_admin: PLATFORM_PERMISSIONS,
  support: [
    'platform.stats.view',
    'platform.users.view',
    'platform.users.update',
    'platform.users.suspend',
    'platform.users.impersonate',
    'platform.tenants.view',
    'platform.tenants.suspend',
    'platform.audit.view',
  ],
  billing: ['platform.stats.view', 'platform.users.view', 'platform.tenants.view', 'platform.billing.manage'],
  analyst: ['platform.stats.view', 'platform.users.view', 'platform.tenants.view'],
};

export const isStaffRole = (v: unknown): v is StaffRole => typeof v === 'string' && (STAFF_ROLES as readonly string[]).includes(v);

/** The staff role in effect: admins without one are super admins; non-admins have none. */
export const staffRoleOf = (user: { role: string; staffRole?: string | null }): StaffRole | null =>
  user.role !== 'admin' ? null : isStaffRole(user.staffRole) ? user.staffRole : 'super_admin';

export const platformPermissionsOf = (user: { role: string; staffRole?: string | null }): PlatformPermission[] => {
  const role = staffRoleOf(user);
  return role ? [...STAFF_ROLE_PERMISSIONS[role]] : [];
};
