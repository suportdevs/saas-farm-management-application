/**
 * Farm permissions — the one place to add, rename or remove a permission.
 *
 * Every module lists its permissions as `key: label`. The full key a role
 * holds is `<module>.<key>`, e.g. `products.category_create`.
 *
 * Keys are written `<operation>_<action>` (category_create, unit_list,
 * purchase_confirm…). An operation only gets the actions listed here: leave
 * `unit_delete` out and units simply can't be deleted by anyone but the owner.
 *
 * `operations` names each operation for the permission screen: keys are
 * grouped under the operation whose prefix they start with. Modules without
 * operations yet keep short keys (e.g. `members.invite`) shown as one group.
 *
 * Adding a module: add it here, then (if the plan or a farm switch can turn it
 * off) to MODULE_CAPABILITIES / TOGGLEABLE_MODULES in farms/access.ts.
 */

import type { CatalogResource } from '../products/catalog';

export interface PermissionModuleConfig {
  label: string;
  /** Operation prefix → its name, e.g. `category: 'Category'`. */
  operations?: Record<string, string>;
  /** Permission key (without the module) → its label. */
  permissions: Record<string, string>;
}

/** The usual actions of a catalog operation: list, create, edit, delete, import and export. */
const catalogActions = <P extends string>(prefix: P, label: string) =>
  ({
    [`${prefix}_list`]: `${label} List`,
    [`${prefix}_create`]: `${label} Create`,
    [`${prefix}_edit`]: `${label} Edit`,
    [`${prefix}_delete`]: `${label} Delete`,
    [`${prefix}_import`]: `${label} Import`,
    [`${prefix}_export`]: `${label} Export`,
  }) as Record<`${P}_${'list' | 'create' | 'edit' | 'delete' | 'import' | 'export'}`, string>;

const CRUD = { view: 'View', create: 'Create', update: 'Edit', delete: 'Delete' } as const;

export const PERMISSION_CONFIG = {
  farm: { label: 'Farm settings', permissions: { update: 'Edit', delete: 'Delete' } },
  members: { label: 'Team', permissions: { view: 'View', invite: 'Invite', update: 'Edit', remove: 'Remove' } },
  roles: { label: 'Roles & permissions', permissions: { view: 'View', manage: 'Manage' } },
  billing: { label: 'Plan & billing', permissions: { view: 'View', manage: 'Manage' } },
  activity: { label: 'Activity log', permissions: { view: 'View' } },

  herd: {
    label: 'Herd',
    operations: { animal: 'Animal', pen: 'Pen' },
    permissions: {
      ...catalogActions('animal', 'Animal'),
      ...catalogActions('pen', 'Pen'),
    },
  },

  // Operation modules not built yet: they get operation keys when their screens are added.
  milk: { label: 'Milk', permissions: CRUD },
  health: { label: 'Health', permissions: CRUD },
  breeding: { label: 'Breeding', permissions: CRUD },
  feed: { label: 'Feed', permissions: CRUD },

  products: {
    label: 'Products',
    operations: {
      product: 'Product',
      product_size: 'Product size',
      category: 'Category',
      brand: 'Brand',
      unit: 'Unit',
      size: 'Size',
      color: 'Color',
    },
    permissions: {
      ...catalogActions('product', 'Product'),
      ...catalogActions('product_size', 'Product Size'),
      ...catalogActions('category', 'Category'),
      ...catalogActions('brand', 'Brand'),
      ...catalogActions('unit', 'Unit'),
      ...catalogActions('size', 'Size'),
      ...catalogActions('color', 'Color'),
    },
  },

  finance: { label: 'Finance', permissions: { ...CRUD, export: 'Export' } },
  reports: { label: 'Reports', permissions: { view: 'View', export: 'Export' } },

  // Example for a future module — an operation with its own actions:
  // purchase: {
  //   label: 'Purchase',
  //   operations: { purchase: 'Purchase' },
  //   permissions: {
  //     purchase_list: 'Purchase List', purchase_create: 'Purchase Create', purchase_edit: 'Purchase Edit',
  //     purchase_delete: 'Purchase Delete', purchase_confirm: 'Purchase Confirm', purchase_reset: 'Purchase Reset',
  //     purchase_items: 'Purchase Items', purchase_invoice: 'Purchase Invoice',
  //   },
  // },
} as const satisfies Record<string, PermissionModuleConfig>;

/** The catalog screens and the `<module>.<operation>` prefix of their permission keys. */
export const CATALOG_OPERATIONS: Record<CatalogResource, string> = {
  products: 'products.product',
  'product-sizes': 'products.product_size',
  categories: 'products.category',
  brands: 'products.brand',
  units: 'products.unit',
  sizes: 'products.size',
  colors: 'products.color',
  animals: 'herd.animal',
  pens: 'herd.pen',
};
