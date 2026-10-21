/**
 * Farm roles and permissions. Shared by the API (enforcement) and the web app
 * (hiding actions a member can't perform).
 *
 * A permission is a per-action key, `<module>.<action>` (e.g. `products.delete`).
 * A member's permissions are resolved in three layers:
 *
 *   1. ROLE_PERMISSIONS — the built-in defaults of their role
 *   2. role overrides   — the farm's own changes to that role (farm_role_permissions)
 *   3. member overrides — per-member allow / deny of single action keys (farm_members.permission_overrides)
 *
 * Owners always hold every permission and can't be overridden.
 */

import type { Capability } from '../subscriptions/plans';

export const FARM_ROLES =['owner', 'manager', 'veterinarian', 'accountant', 'worker', 'viewer'] as const;
export type FarmRole = (typeof FARM_ROLES)[number];

export const ROLE_INFO: Record<FarmRole, { label: string; description: string }> = {
  owner: { label: 'Owner', description: 'Full control, including billing, ownership and deleting the farm.' },
  manager: { label: 'Manager', description: 'Runs day-to-day operations and manages the team.' },
  veterinarian: { label: 'Veterinarian', description: 'Records health, treatments and breeding events.' },
  accountant: { label: 'Accountant', description: 'Manages finances, sales and expenses, and sees billing.' },
  worker: { label: 'Farm worker', description: 'Records daily work: milking, feeding and animal events.' },
  viewer: { label: 'Viewer', description: 'Read-only access, e.g. for advisors or investors.' },
};

export const PERMISSION_ACTION_LABELS = {
  view: 'View',
  create: 'Create',
  update: 'Edit',
  delete: 'Delete',
  import: 'Import',
  export: 'Export',
  invite: 'Invite',
  remove: 'Remove',
  manage: 'Manage',
} as const;
export type PermissionAction = keyof typeof PERMISSION_ACTION_LABELS;

const CRUD = ['view', 'create', 'update', 'delete'] as const;

/** Every permission module and the actions it can be granted per action. Add a module here to give it keys. */
export const PERMISSION_MODULES = {
  farm: { label: 'Farm settings', actions: ['update', 'delete'] },
  members: { label: 'Team', actions: ['view', 'invite', 'update', 'remove'] },
  roles: { label: 'Roles & permissions', actions: ['view', 'manage'] },
  billing: { label: 'Plan & billing', actions: ['view', 'manage'] },
  activity: { label: 'Activity log', actions: ['view'] },
  herd: { label: 'Herd', actions: CRUD },
  milk: { label: 'Milk', actions: CRUD },
  health: { label: 'Health', actions: CRUD },
  breeding: { label: 'Breeding', actions: CRUD },
  feed: { label: 'Feed', actions: CRUD },
  products: { label: 'Products', actions: [...CRUD, 'import', 'export'] },
  finance: { label: 'Finance', actions: [...CRUD, 'export'] },
  reports: { label: 'Reports', actions: ['view', 'export'] },
} as const satisfies Record<string, { label: string; actions: readonly PermissionAction[] }>;

export type PermissionModule = keyof typeof PERMISSION_MODULES;
export const PERMISSION_MODULE_KEYS = Object.keys(PERMISSION_MODULES) as PermissionModule[];

export type Permission = {
  [M in PermissionModule]: `${M}.${(typeof PERMISSION_MODULES)[M]['actions'][number]}`;
}[PermissionModule];

export const PERMISSIONS = PERMISSION_MODULE_KEYS.flatMap((m) =>
  PERMISSION_MODULES[m].actions.map((a) => `${m}.${a}` as Permission),
);

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);
export const isPermission = (value: unknown): value is Permission => typeof value === 'string' && PERMISSION_SET.has(value);

/** The action keys of one module, e.g. `modulePermissions('products')`. */
export const modulePermissions = (module: PermissionModule): Permission[] =>
  PERMISSION_MODULES[module].actions.map((a) => `${module}.${a}` as Permission);

/** Keys only owners hold: they can't be granted to another role or member. */
export const OWNER_ONLY_PERMISSIONS: readonly Permission[] = ['farm.delete'];
export const isOwnerOnly = (p: Permission) => OWNER_ONLY_PERMISSIONS.includes(p);

/** What every role sees: the team and the operational records. */
const BASE: Permission[] = [
  'members.view',
  ...(['herd', 'milk', 'health', 'breeding', 'feed', 'products'] as const).map((m) => `${m}.view` as Permission),
  'products.export',
];

/** Keeps every permission list in PERMISSIONS order. */
const ordered = (keys: readonly Permission[]) => PERMISSIONS.filter((p) => keys.includes(p));

export const ROLE_PERMISSIONS: Record<FarmRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: PERMISSIONS.filter((p) => !isOwnerOnly(p) && p !== 'billing.manage' && p !== 'roles.manage'),
  veterinarian: ordered([...BASE, 'herd.create', 'herd.update', ...modulePermissions('health'), ...modulePermissions('breeding'), 'reports.view']),
  accountant: ordered([...BASE, 'billing.view', ...modulePermissions('finance'), ...modulePermissions('reports')]),
  worker: ordered([...BASE, 'herd.create', 'herd.update', 'milk.create', 'milk.update', 'feed.create', 'feed.update']),
  viewer: ordered(BASE),
};

/** Allow (true) or deny (false) per action key; keys left out are inherited from the layer below. */
export type PermissionOverrides = Partial<Record<Permission, boolean>>;

/** Drops unknown keys (e.g. permissions removed since they were stored) and non-boolean values. */
export function cleanOverrides(raw: unknown): PermissionOverrides {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => isPermission(k) && typeof v === 'boolean'));
}

const applyOverrides = (base: Iterable<Permission>, overrides: PermissionOverrides) => {
  const set = new Set(base);
  for (const [key, allowed] of Object.entries(overrides) as [Permission, boolean][]) {
    if (allowed) set.add(key);
    else set.delete(key);
  }
  return set;
};

/** A role's permissions on one farm: its defaults with the farm's role overrides applied. */
export function rolePermissions(role: FarmRole, roleOverrides: PermissionOverrides = {}): Permission[] {
  if (role === 'owner') return [...PERMISSIONS];
  const set = applyOverrides(ROLE_PERMISSIONS[role], roleOverrides);
  return PERMISSIONS.filter((p) => set.has(p) && !isOwnerOnly(p));
}

/**
 * A member's effective permissions, in PERMISSIONS order. A member with a
 * custom role gets that role's keys in place of their system role's.
 */
export function resolvePermissions(
  role: FarmRole,
  layers: { roleOverrides?: PermissionOverrides; memberOverrides?: PermissionOverrides; customRole?: readonly unknown[] | null } = {},
): Permission[] {
  if (role === 'owner') return [...PERMISSIONS];
  const base = layers.customRole ? cleanPermissions(layers.customRole) : rolePermissions(role, layers.roleOverrides);
  const set = applyOverrides(base, layers.memberOverrides ?? {});
  return PERMISSIONS.filter((p) => set.has(p) && !isOwnerOnly(p));
}

/** A stored permission list, minus unknown and owner-only keys, in PERMISSIONS order. */
export function cleanPermissions(raw: readonly unknown[]): Permission[] {
  const set = new Set(raw.filter(isPermission));
  return PERMISSIONS.filter((p) => set.has(p) && !isOwnerOnly(p));
}

/**
 * Members with a custom role are stored with this system role underneath: it
 * carries no special powers (unlike owner), so owner-only rules keep working.
 */
export const CUSTOM_ROLE_BASE: FarmRole = 'viewer';

/** Most custom roles a farm can define. */
export const MAX_CUSTOM_ROLES = 30;

/** The name shown for a member: their custom role, else their system role. */
export const roleLabel = (role: FarmRole, customRole?: { name: string } | null) => customRole?.name ?? ROLE_INFO[role].label;

/** The role overrides that turn a role's defaults into `wanted`. */
export function diffFromDefaults(role: FarmRole, wanted: readonly Permission[]): PermissionOverrides {
  const defaults = new Set(ROLE_PERMISSIONS[role]);
  const target = new Set(wanted);
  const overrides: PermissionOverrides = {};
  for (const p of PERMISSIONS) {
    if (defaults.has(p) !== target.has(p)) overrides[p] = target.has(p);
  }
  return overrides;
}

// ─── Module gating: plan and tenant switches ─────────────────────
//
// On top of the three permission layers, a farm only gets the keys of modules
// that are (a) included in its plan and (b) switched on in its settings.

/** The plan capability a module needs. Modules left out are on every plan. */
export const MODULE_CAPABILITIES: Partial<Record<PermissionModule, Capability>> = {
  herd: 'herd',
  milk: 'milk',
  health: 'health',
  breeding: 'breeding',
  feed: 'feed',
  finance: 'finance',
  reports: 'advanced_reports',
};

/** The plan capability an action needs in any module (e.g. every `*.export`). */
export const ACTION_CAPABILITIES: Partial<Record<PermissionAction, Capability>> = {
  export: 'data_export',
};

/** Business modules a farm can switch off. Team, billing, settings and activity always stay on. */
export const TOGGLEABLE_MODULES = ['herd', 'milk', 'health', 'breeding', 'feed', 'products', 'finance', 'reports'] as const satisfies readonly PermissionModule[];
export type ToggleableModule = (typeof TOGGLEABLE_MODULES)[number];
export const isToggleable = (m: PermissionModule): m is ToggleableModule => (TOGGLEABLE_MODULES as readonly string[]).includes(m);

/** enabled · `plan` = not in the farm's plan (upgrade unlocks it) · `disabled` = switched off by the farm. */
export type ModuleStatus = 'enabled' | 'plan' | 'disabled';

export interface ModuleGate {
  capabilities: readonly Capability[];
  disabledModules: readonly string[];
}

export function moduleStatus(module: PermissionModule, gate: ModuleGate): ModuleStatus {
  if (isToggleable(module) && gate.disabledModules.includes(module)) return 'disabled';
  const needs = MODULE_CAPABILITIES[module];
  if (needs && !gate.capabilities.includes(needs)) return 'plan';
  return 'enabled';
}

export const moduleStatuses = (gate: ModuleGate) =>
  Object.fromEntries(PERMISSION_MODULE_KEYS.map((m) => [m, moduleStatus(m, gate)])) as Record<PermissionModule, ModuleStatus>;

/** Why the farm (not the member) can't use `permission`, or null. */
export function permissionBlock(permission: Permission, gate: ModuleGate): Exclude<ModuleStatus, 'enabled'> | null {
  const [module, action] = permission.split('.') as [PermissionModule, PermissionAction];
  const status = moduleStatus(module, gate);
  if (status !== 'enabled') return status;
  const needs = ACTION_CAPABILITIES[action];
  return needs && !gate.capabilities.includes(needs) ? 'plan' : null;
}

/** Drops the keys the farm's plan or module switches don't allow. */
export const gatePermissions = (permissions: readonly Permission[], gate: ModuleGate) => permissions.filter((p) => !permissionBlock(p, gate));

/** Roles a member may assign: only owners hand out ownership. */
export const assignableRoles = (actor: FarmRole): FarmRole[] =>
  actor === 'owner' ? [...FARM_ROLES] : FARM_ROLES.filter((r) => r !== 'owner');
