/**
 * The product catalog: products and the master data they are described with.
 * One definition per resource drives the API (validation, import, filters),
 * the web table, the create/edit modal, the filter panel and the CSV
 * import/export format — add a column here and it shows up everywhere.
 */

export const CATALOG_RESOURCES = [
  'products',
  'product-sizes',
  'categories',
  'brands',
  'units',
  'sizes',
  'colors',
] as const;
export type CatalogResource = (typeof CATALOG_RESOURCES)[number];

export interface CatalogColumn {
  /** Property on a list row. */
  key: string;
  /** Property in the create/update body. Defaults to `key`. */
  field?: string;
  label: string;
  /** Column header in import/export files, and the filter's URL parameter. */
  csv: string;
  required?: boolean;
  input?: 'text' | 'textarea' | 'color' | 'number' | 'status';
  /** The form shows a searchable select of this catalog; the row shows the referenced name. */
  ref?: CatalogResource;
  /**
   * Another column's `csv`: this select's choices are narrowed by that column's value
   * (sent as a filter to the options endpoint), and it is cleared when that value changes.
   */
  dependsOn?: string;
  /** Shown in the form, table and filters but not stored on this table (and not imported). */
  virtual?: boolean;
  /** Sample value written to the import template. */
  example: string;
}

export interface CatalogDefinition {
  label: string;
  plural: string;
  description: string;
  columns: CatalogColumn[];
  /** Columns (by `csv`) offered in the advanced filter, besides the created-date range. */
  filters: string[];
  /** Rows can carry one image (uploaded separately from the form body). */
  image?: boolean;
}

// ─── Status ──────────────────────────────────────────────────────

export const STATUS = { active: 1, inactive: 0 } as const;
export type Status = (typeof STATUS)[keyof typeof STATUS];
export const STATUS_OPTIONS = [
  { value: '1', label: 'Active' },
  { value: '0', label: 'Inactive' },
] as const;
export const statusLabel = (status: unknown) =>
  Number(status) === STATUS.active ? 'Active' : 'Inactive';

// ─── Definitions ─────────────────────────────────────────────────

const name = (example: string): CatalogColumn => ({
  key: 'name',
  label: 'Name',
  csv: 'name',
  required: true,
  example,
});
const code = (example: string, required = false): CatalogColumn => ({
  key: 'code',
  label: 'Code',
  csv: 'code',
  required,
  example,
});
const description = (example: string): CatalogColumn => ({
  key: 'description',
  label: 'Description',
  csv: 'description',
  input: 'textarea',
  example,
});
const status: CatalogColumn = {
  key: 'status',
  label: 'Status',
  csv: 'status',
  input: 'status',
  example: 'Active',
};

/** A reference column: `category` → row `categoryName`, body `categoryKey`. */
const ref = (
  csv: string,
  label: string,
  resource: CatalogResource,
  required: boolean,
  example: string,
): CatalogColumn => ({
  key: `${csv}Name`,
  field: `${csv}Key`,
  label,
  csv,
  required,
  ref: resource,
  example,
});

export const CATALOG: Record<CatalogResource, CatalogDefinition> = {
  products: {
    label: 'Product',
    plural: 'Products',
    description: 'Everything the farm buys, stores or sells — feed, medicine, milk, equipment.',
    columns: [
      name('Dairy concentrate 18%'),
      code('FD-001', true),
      ref('category', 'Category', 'categories', true, 'Feed'),
      ref('brand', 'Brand', 'brands', false, 'Cargill'),
      ref('unit', 'Unit', 'units', true, 'kg'),
      status,
      description('High-protein pellets for lactating cows'),
    ],
    filters: ['category', 'brand', 'unit', 'status'],
    image: true,
  },
  'product-sizes': {
    label: 'Product size',
    plural: 'Product sizes',
    description: 'The sizes each product comes in, e.g. Dairy concentrate · 25 kg bag.',
    columns: [
      // Narrows the product select; a product size stores only its product.
      { ...ref('category', 'Category', 'categories', false, 'Feed'), virtual: true },
      { ...ref('product', 'Product', 'products', true, 'FD-001'), dependsOn: 'category' },
      ref('size', 'Size', 'sizes', false, '25 kg bag'),
      ref('unit', 'Unit', 'units', false, 'kg'),
      name('Dairy concentrate 25 kg'),
      code('FD-001-25'),
      status,
    ],
    filters: ['category', 'product', 'size', 'unit', 'status'],
  },
  categories: {
    label: 'Category',
    plural: 'Categories',
    description: 'Group products, e.g. Feed, Medicine, Equipment.',
    columns: [name('Feed'), code('FEED'), description('Concentrates, forage and minerals')],
    filters: [],
  },
  brands: {
    label: 'Brand',
    plural: 'Brands',
    description: 'Manufacturers and brands of the products you use.',
    columns: [name('Cargill'), code('CRG'), description('Feed supplier')],
    filters: [],
  },
  units: {
    label: 'Unit',
    plural: 'Units',
    description: 'Units products are counted or measured in.',
    columns: [
      name('Kilogram'),
      { key: 'shortName', label: 'Short name', csv: 'short_name', required: true, example: 'kg' },
      description('Weight'),
    ],
    filters: [],
  },
  sizes: {
    label: 'Size',
    plural: 'Sizes',
    description: 'Pack or item sizes, e.g. 25 kg bag, 1 L bottle.',
    columns: [
      name('25 kg bag'),
      { key: 'shortName', label: 'Short name', csv: 'short_name', example: '25KG' },
      {
        key: 'weight',
        label: 'Weight',
        csv: 'weight',
        input: 'number',
        required: true,
        example: '25',
      },
      description('Standard feed bag'),
    ],
    filters: ['weight'],
  },
  colors: {
    label: 'Color',
    plural: 'Colors',
    description: 'Colors used for tags, equipment and packaging.',
    columns: [name('Red'), { ...code('#DC2626'), input: 'color' }, description('Ear tag colour')],
    filters: [],
  },
};

export const isCatalogResource = (v: unknown): v is CatalogResource =>
  typeof v === 'string' && (CATALOG_RESOURCES as readonly string[]).includes(v);

/** Path under /farms/:farm — the same for the API and the web app (`products`, `products/units`…). */
export const catalogPath = (resource: CatalogResource) =>
  resource === 'products' ? 'products' : `products/${resource}`;

/** Body key of a column. */
export const fieldOf = (c: CatalogColumn) => c.field ?? c.key;

export const hasStatus = (resource: CatalogResource) =>
  CATALOG[resource].columns.some((c) => c.input === 'status');

/** Columns of import files and the import template (virtual columns aren't stored). */
export const importColumns = (resource: CatalogResource) =>
  CATALOG[resource].columns.filter((c) => !c.virtual);

export const filterColumns = (resource: CatalogResource) =>
  CATALOG[resource].filters.map((csv) => CATALOG[resource].columns.find((c) => c.csv === csv)!);

/** Most rows a single import may contain. */
export const CATALOG_IMPORT_LIMIT = 1000;
/** Most rows an export or print returns. */
export const CATALOG_EXPORT_LIMIT = 10_000;
/** Most choices a searchable select loads at once. */
export const CATALOG_OPTIONS_LIMIT = 50;

/** Image uploads: accepted types (checked by file signature) and the size limit. */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
