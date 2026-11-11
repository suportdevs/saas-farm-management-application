/**
 * Farm roles and permissions. Shared by the API (enforcement) and the web app
 * (hiding actions a member can't perform).
 *
 * A permission is a per-action key, `<module>.<key>` (e.g. `products.category_delete`),
 * listed module by module in config/permissions.ts.
 * A member's permissions are resolved in three layers:
 *
 *   1. ROLE_PERMISSIONS — the built-in defaults of their role
 *   2. role overrides   — the farm's own changes to that role (farm_role_permissions)
 *   3. member overrides — per-member allow / deny of single action keys (farm_members.permission_overrides)
 *
 * Owners always hold every permission and can't be overridden.
 */

import { CATALOG_OPERATIONS, PERMISSION_CONFIG, type PermissionModuleConfig } from '../config/permissions';
import type { CatalogResource } from '../products/catalog';
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

/**
 * Modules and their permissions come from config/permissions.ts — add a
 * permission there. A key is `<module>.<key>`, e.g. `products.category_create`.
 */
export const PERMISSION_MODULES = PERMISSION_CONFIG;
type Config = typeof PERMISSION_CONFIG;

export type PermissionModule = keyof Config;
export const PERMISSION_MODULE_KEYS = Object.keys(PERMISSION_CONFIG) as PermissionModule[];

export type Permission = {
  [M in PermissionModule]: `${M}.${Extract<keyof Config[M]['permissions'], string>}`;
}[PermissionModule];

/** Every key of one module, in config order, e.g. `modulePermissions('products')`. */
export const modulePermissions = (module: PermissionModule): Permission[] =>
  Object.keys(PERMISSION_CONFIG[module].permissions).map((k) => `${module}.${k}` as Permission);

export const PERMISSIONS = PERMISSION_MODULE_KEYS.flatMap(modulePermissions);

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);
export const isPermission = (value: unknown): value is Permission => typeof value === 'string' && PERMISSION_SET.has(value);

/** The module of a key, e.g. `products`. */
export const moduleOf = (p: Permission) => p.slice(0, p.indexOf('.')) as PermissionModule;
/** The part after the module, e.g. `category_create`. */
const keyPart = (p: Permission) => p.slice(p.indexOf('.') + 1);

/** The label from the config, e.g. `Category Create`. */
export const permissionLabel = (p: Permission): string =>
  (PERMISSION_CONFIG[moduleOf(p)].permissions as Record<string, string>)[keyPart(p)] ?? p;

export interface PermissionOperation {
  /** Operation prefix (`category`), or '' for a module's own short keys. */
  key: string;
  label: string;
  permissions: Permission[];
}

/**
 * A module's keys grouped by operation, for the permission screens:
 * `products.category_create` goes under "Category". Keys that match no
 * operation are grouped under the module's own name.
 */
export function permissionOperations(module: PermissionModule): PermissionOperation[] {
  const config: PermissionModuleConfig = PERMISSION_CONFIG[module];
  const operations = config.operations ?? {};
  // Longest prefix first, so `product_size_list` goes to product_size, not product.
  const prefixes = Object.keys(operations).sort((a, b) => b.length - a.length);
  const groups = new Map<string, PermissionOperation>();
  for (const p of modulePermissions(module)) {
    const op = prefixes.find((prefix) => keyPart(p).startsWith(`${prefix}_`)) ?? '';
    if (!groups.has(op)) groups.set(op, { key: op, label: op ? operations[op]! : config.label, permissions: [] });
    groups.get(op)!.permissions.push(p);
  }
  return [...groups.values()];
}

export type CatalogAction = 'list' | 'create' | 'edit' | 'delete' | 'import' | 'export';

/** One catalog screen's key, e.g. `catalogPermission('categories', 'create')` → `products.category_create`. */
export const catalogPermission = (resource: CatalogResource, action: CatalogAction) => `${CATALOG_OPERATIONS[resource]}_${action}` as Permission;

/** Keys of a module ending in `action`, e.g. (`products`, `list`) → every `products.*_list`. */
export const permissionsWithAction = (module: PermissionModule, action: string) =>
  modulePermissions(module).filter((p) => keyPart(p) === action || keyPart(p).endsWith(`_${action}`));

/** Keys only owners hold: they can't be granted to another role or member. */
export const OWNER_ONLY_PERMISSIONS: readonly Permission[] = ['farm.delete'];
export const isOwnerOnly = (p: Permission) => OWNER_ONLY_PERMISSIONS.includes(p);

/** What every role sees: the team and the operational records. */
const BASE: Permission[] = [
  'members.view',
  ...(['milk', 'health', 'breeding', 'feed'] as const).map((m) => `${m}.view` as Permission),
  ...permissionsWithAction('herd', 'list'),
  ...permissionsWithAction('products', 'list'),
  ...permissionsWithAction('products', 'export'),
];

/** Keeps every permission list in PERMISSIONS order. */
const ordered = (keys: readonly Permission[]) => PERMISSIONS.filter((p) => keys.includes(p));

export const ROLE_PERMISSIONS: Record<FarmRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: PERMISSIONS.filter((p) => !isOwnerOnly(p) && p !== 'billing.manage' && p !== 'roles.manage'),
  veterinarian: ordered([...BASE, 'herd.animal_create', 'herd.animal_edit', ...modulePermissions('health'), ...modulePermissions('breeding'), 'reports.view']),
  accountant: ordered([...BASE, 'billing.view', ...modulePermissions('finance'), ...modulePermissions('reports')]),
  worker: ordered([...BASE, 'herd.animal_create', 'herd.animal_edit', 'milk.create', 'milk.update', 'feed.create', 'feed.update']),
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
  products: 'products',
  finance: 'finance',
  reports: 'advanced_reports',
};

/** The plan capability an action needs in any module (e.g. every `*.export` and `*_export`). */
export const ACTION_CAPABILITIES: Record<string, Capability> = {
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
  const status = moduleStatus(moduleOf(permission), gate);
  if (status !== 'enabled') return status;
  const key = keyPart(permission);
  const action = Object.keys(ACTION_CAPABILITIES).find((a) => key === a || key.endsWith(`_${a}`));
  const needs = action ? ACTION_CAPABILITIES[action] : undefined;
  return needs && !gate.capabilities.includes(needs) ? 'plan' : null;
}

/** Drops the keys the farm's plan or module switches don't allow. */
export const gatePermissions = (permissions: readonly Permission[], gate: ModuleGate) => permissions.filter((p) => !permissionBlock(p, gate));

/** Roles a member may assign: only owners hand out ownership. */
export const assignableRoles = (actor: FarmRole): FarmRole[] =>
  actor === 'owner' ? [...FARM_ROLES] : FARM_ROLES.filter((r) => r !== 'owner');
