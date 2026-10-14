import { z } from 'zod';
import {
  CATALOG_IMPORT_LIMIT,
  CATALOG_OPTIONS_LIMIT,
  fieldOf,
  filterColumns,
  importColumns,
  STATUS,
  type CatalogResource,
} from './catalog';

const required = (label: string, max: number) =>
  z.string(`${label} is required`).trim().min(1, `${label} is required`).max(max);

/** Empty strings (forms, CSV cells) become null. */
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

/** A required reference: the referenced row's key. */
const ref = (message: string) => z.uuid(message);
/** An optional reference: key, or empty/null for none. */
const optionalRef = z
  .union([z.uuid('Choose a valid option'), z.literal('')])
  .nullish()
  .transform((v) => v || null);

/** Accepts numbers or numeric strings; empty → null, or an error when `required` (a label) is set. */
const decimal = (max: number, required?: string) =>
  z
    .union([z.number(), z.string().trim()])
    .nullish()
    .transform((v, ctx) => {
      if (v === '' || v == null) {
        if (!required) return null;
        ctx.addIssue({ code: 'custom', message: `${required} is required` });
        return z.NEVER;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > max) {
        ctx.addIssue({
          code: 'custom',
          message: `Enter a number between 0 and ${max.toLocaleString('en')}`,
        });
        return z.NEVER;
      }
      return n;
    });

/** 1/0, "1"/"0" or "active"/"inactive" (any case); missing → active. */
const status = z
  .union([z.number(), z.string().trim().toLowerCase()])
  .nullish()
  .transform((v, ctx) => {
    if (v === '' || v == null) return STATUS.active;
    if (v === 1 || v === '1' || v === 'active') return STATUS.active;
    if (v === 0 || v === '0' || v === 'inactive') return STATUS.inactive;
    ctx.addIssue({ code: 'custom', message: 'Use Active or Inactive' });
    return z.NEVER;
  });

const name = required('Name', 100);
const description = optional(500);
const code = optional(30);

// ─── Create / update bodies (the modal form) ─────────────────────

export const unitSchema = z.object({ name, shortName: required('Short name', 20), description });
export const sizeSchema = z.object({
  name,
  shortName: optional(20),
  weight: decimal(1_000_000, 'Weight'),
  description,
});
export const colorSchema = z.object({ name, code, description });
export const brandSchema = z.object({ name, code, description });
export const categorySchema = z.object({ name, code, description });
export const productSchema = z.object({
  name: required('Name', 150),
  code: required('Code', 50),
  categoryKey: ref('Choose a category'),
  brandKey: optionalRef,
  unitKey: ref('Choose a unit'),
  status,
  description,
});
export const productSizeSchema = z.object({
  /** Only narrows the product select in the form; not stored. */
  categoryKey: optionalRef,
  productKey: ref('Choose a product'),
  sizeKey: optionalRef,
  unitKey: optionalRef,
  name: required('Name', 150),
  code: optional(50),
  status,
});

export type ProductInput = z.input<typeof productSchema>;
export type ProductData = z.output<typeof productSchema>;
export type ProductSizeData = z.output<typeof productSizeSchema>;

export const catalogSchemas = {
  products: productSchema,
  'product-sizes': productSizeSchema,
  categories: categorySchema,
  brands: brandSchema,
  units: unitSchema,
  sizes: sizeSchema,
  colors: colorSchema,
} satisfies Record<CatalogResource, z.ZodObject>;

// ─── Import rows ─────────────────────────────────────────────────

/**
 * One CSV row, keyed by the CSV header. Validates each cell like the form
 * does, then re-keys it by body field. Reference cells stay as text (a code or
 * name) — the API resolves them to rows.
 */
export function catalogImportRowSchema(resource: CatalogResource) {
  const columns = importColumns(resource);
  const body: Record<string, z.ZodType> = catalogSchemas[resource].shape;
  const shape = Object.fromEntries(
    columns.map((c) => [
      c.csv,
      c.ref ? (c.required ? required(c.label, 150) : optional(150)) : body[fieldOf(c)]!,
    ]),
  );
  return z
    .object(shape)
    .transform(
      (row) =>
        Object.fromEntries(columns.map((c) => [fieldOf(c), row[c.csv]])) as Record<string, unknown>,
    );
}

export const catalogImportSchema = (resource: CatalogResource) =>
  z.object({
    rows: z
      .array(catalogImportRowSchema(resource))
      .min(1, 'The file has no rows')
      .max(
        CATALOG_IMPORT_LIMIT,
        `Import at most ${CATALOG_IMPORT_LIMIT.toLocaleString('en')} rows at a time`,
      ),
  });

// ─── Queries ─────────────────────────────────────────────────────

/** Query-string values: empty → undefined. */
const param = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
const day = z.iso.date('Use YYYY-MM-DD');

/**
 * Search and advanced filters, as URL parameters:
 *   q, from, to (created date), <ref>=<key>, status=1|0, <number>Min / <number>Max
 */
export function catalogFilterSchema(resource: CatalogResource) {
  const shape: Record<string, z.ZodType> = {
    q: param(z.string().trim().max(100)),
    from: param(day),
    to: param(day),
  };
  for (const c of filterColumns(resource)) {
    if (c.ref) shape[c.csv] = param(z.uuid());
    else if (c.input === 'status') shape[c.csv] = param(z.enum(['1', '0']).transform(Number));
    else if (c.input === 'number') {
      shape[`${c.csv}Min`] = param(z.coerce.number());
      shape[`${c.csv}Max`] = param(z.coerce.number());
    }
  }
  return z.object(shape);
}

export const catalogListSchema = (resource: CatalogResource) =>
  catalogFilterSchema(resource).extend({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  });

export type CatalogFilters = Record<string, string | number | undefined>;
export type CatalogListQuery = CatalogFilters & { page: number; pageSize: number };

/** Searchable-select choices: `q` plus the same filters as the list (e.g. products of a category). */
export const catalogOptionsSchema = (resource: CatalogResource) =>
  catalogFilterSchema(resource).extend({
    /** Comma-separated keys — resolves the labels of already-selected values. */
    keys: param(
      z
        .string()
        .transform((v) => v.split(',').filter(Boolean))
        .pipe(z.array(z.uuid()).max(CATALOG_OPTIONS_LIMIT)),
    ),
  });

/** Selected rows, for bulk delete and status toggle. */
export const bulkKeysSchema = z.object({
  keys: z.array(z.uuid()).min(1, 'Select at least one row').max(500),
});
