/**
 * Farm roles and the permission matrix. Shared by the API (enforcement) and
 * the web app (hiding actions a member can't perform).
 */

export const FARM_ROLES = ['owner', 'manager', 'veterinarian', 'accountant', 'worker', 'viewer'] as const;
export type FarmRole = (typeof FARM_ROLES)[number];

export const ROLE_INFO: Record<FarmRole, { label: string; description: string }> = {
  owner: { label: 'Owner', description: 'Full control, including billing, ownership and deleting the farm.' },
  manager: { label: 'Manager', description: 'Runs day-to-day operations and manages the team.' },
  veterinarian: { label: 'Veterinarian', description: 'Records health, treatments and breeding events.' },
  accountant: { label: 'Accountant', description: 'Manages finances, sales and expenses, and sees billing.' },
  worker: { label: 'Farm worker', description: 'Records daily work: milking, feeding and animal events.' },
  viewer: { label: 'Viewer', description: 'Read-only access, e.g. for advisors or investors.' },
};

export const PERMISSIONS = [
  'farm.update',
  'farm.delete',
  'billing.view',
  'billing.manage',
  'members.manage',
  'activity.view',
  'herd.manage',
  'milk.manage',
  'health.manage',
  'breeding.manage',
  'feed.manage',
  'products.manage',
  'finance.view',
  'finance.manage',
  'reports.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<FarmRole, readonly Permission[]> = {
  owner: ALL,
  manager: ALL.filter((p) => p !== 'farm.delete' && p !== 'billing.manage'),
  veterinarian: ['herd.manage', 'health.manage', 'breeding.manage', 'reports.view'],
  accountant: ['billing.view', 'finance.view', 'finance.manage', 'reports.view'],
  worker: ['herd.manage', 'milk.manage', 'feed.manage'],
  viewer: [],
};

export const can = (role: FarmRole, permission: Permission) => ROLE_PERMISSIONS[role].includes(permission);

/** Roles a member may assign: only owners hand out ownership. */
export const assignableRoles = (actor: FarmRole): FarmRole[] =>
  actor === 'owner' ? [...FARM_ROLES] : FARM_ROLES.filter((r) => r !== 'owner');
