import {
  and,
  asc,
  count,
  eq,
  getTableColumns,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { PgColumn, PgSelect, PgTable, SelectedFields } from 'drizzle-orm/pg-core';
import {
  CATALOG,
  CATALOG_EXPORT_LIMIT,
  CATALOG_OPTIONS_LIMIT,
  fieldOf,
  filterColumns,
  hasStatus,
  STATUS,
  type CatalogDefinition,
  type CatalogFilters,
  type CatalogListQuery,
  type CatalogResource,
  type ImageType,
} from '@kit/shared';
import { conflict, db, notFound, storage, validationError } from '../../core';
import type { Tx } from '../farms';
import { imageFileName, imageTypeOf } from './images';

/** The columns every catalog table shares (see `base()` and `audit()` in schema.ts). */
export type CatalogTable = PgTable & {
  id: PgColumn;
  key: PgColumn;
  tenantId: PgColumn;
  name: PgColumn;
  createdAt: PgColumn;
  deletedAt: PgColumn;
};

/** The farm a request works in. */
export interface Tenant {
  id: string;
  timezone: string;
}

export type Values = Record<string, unknown>;
type FieldErrors = Record<string, string[]>;

export interface UniqueRule {
  /** Unique index name, as declared in schema.ts. */
  index: string;
  column: PgColumn;
  /** Body field the index guards. */
  field: string;
}

export interface Reference {
  /** Foreign-key column on this catalog's table. */
  column: PgColumn;
  /** The catalog it points at. */
  catalog: Catalog;
  /** Matched besides the name when importing — e.g. a category's code, a unit's short name. */
  matchBy: PgColumn;
}

/** Rows of another table that point at this one. */
export interface Dependent {
  table: CatalogTable;
  column: PgColumn;
  label: string;
}

export interface CatalogConfig {
  resource: CatalogResource;
  table: CatalogTable;
  /** Columns a list row returns — only what the table, edit modal and export use. */
  fields: SelectedFields;
  /** Joins needed by `fields`: inner for required references, left for optional ones. */
  joins?: { table: PgTable; on: SQL; left?: boolean }[];
  /** Own columns matched by the search box and the searchable selects. */
  search: PgColumn[];
  unique: UniqueRule[];
  /** Reference fields of the body (`categoryKey`…) and the foreign keys they fill. */
  references?: Record<string, Reference>;
  /** Filters on virtual columns (by `csv`), which aren't foreign keys of this table. */
  virtualFilters?: Record<string, (tenantId: string, key: string) => SQL>;
  /** Rows that block deleting a row of this catalog. */
  usedBy?: Dependent[];
  /** Rows soft-deleted together with a row of this catalog. */
  cascade?: Omit<Dependent, 'label'>[];
  /** Runs in the same transaction after rows are created (form or import). `rows` include `id`. */
  onCreated?: (tx: Tx, tenantId: string, userId: string, rows: Values[]) => Promise<void>;
}

const escapeLike = (term: string) => term.replace(/[\\%_]/g, (c) => `\\${c}`);
const lower = (column: PgColumn) => sql<string>`lower(${column})`;
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

/** Postgres unique violation → the index name. Drizzle wraps driver errors in `cause`. */
function violatedIndex(err: unknown): string | null {
  const pg = ((err as { cause?: unknown })?.cause ?? err) as { code?: string; constraint?: string };
  return pg?.code === '23505' ? (pg.constraint ?? '') : null;
}

/**
 * CRUD for one catalog table, scoped to a tenant. Every query filters by
 * tenant and skips soft-deleted rows; reads select only `config.fields`.
 * Everything resource-specific comes from the config and the shared
 * definition (`CATALOG[resource]`).
 */
export class Catalog {
  readonly definition: CatalogDefinition;
  private readonly columns: Record<string, PgColumn>;
  private readonly references: [field: string, ref: Reference, property: string][];

  constructor(readonly config: CatalogConfig) {
    this.definition = CATALOG[config.resource];
    this.columns = getTableColumns(config.table);
    // Body field → table property of its foreign key (categoryKey → categoryId).
    this.references = Object.entries(config.references ?? {}).map(([field, ref]) => [
      field,
      ref,
      Object.entries(this.columns).find(([, c]) => c === ref.column)![0],
    ]);
  }

  get resource() {
    return this.config.resource;
  }

  // ─── Reads ─────────────────────────────────────────────────────

  async list(tenant: Tenant, { page, pageSize, ...filters }: CatalogListQuery) {
    const where = this.filtered(tenant, filters);
    const [rows, [total]] = await Promise.all([
      this.rows(where)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ value: count() }).from(this.config.table).where(where),
    ]);
    return { rows, pagination: { page, pageSize, total: total?.value ?? 0 } };
  }

  /** Every matching row, for export and print. */
  export(tenant: Tenant, filters: CatalogFilters) {
    return this.rows(this.filtered(tenant, filters)).limit(CATALOG_EXPORT_LIMIT);
  }

  /**
   * Choices for a searchable select: active rows matching `q` and the filters
   * (e.g. a category's products), or the rows with these `keys` (to label
   * values already selected, even if inactive).
   */
  options(tenant: Tenant, { keys, ...filters }: CatalogFilters & { keys?: string[] }) {
    const t = this.config.table;
    const where = keys
      ? this.active(tenant.id, inArray(t.key, keys))
      : this.filtered(
          tenant,
          filters,
          hasStatus(this.resource) ? eq(this.column('status'), STATUS.active) : undefined,
        );
    return db
      .select({ key: t.key, name: t.name })
      .from(t)
      .where(where)
      .orderBy(asc(t.name))
      .limit(CATALOG_OPTIONS_LIMIT);
  }

  /** Internal id of a row (for foreign keys), or null. */
  async idOf(tenantId: string, key: string): Promise<number | null> {
    const t = this.config.table;
    const [row] = await db
      .select({ id: t.id })
      .from(t)
      .where(this.active(tenantId, eq(t.key, key)))
      .limit(1);
    return (row?.id as number | undefined) ?? null;
  }

  /** Rows whose name or `alt` column matches one of `values` (case-insensitive): lowercased value → id. */
  async idsByName(tenantId: string, values: string[], alt: PgColumn): Promise<Map<string, number>> {
    const t = this.config.table;
    const wanted = [...new Set(values.map((v) => v.toLowerCase()))];
    if (!wanted.length) return new Map();
    const rows = await db
      .select({ id: t.id, name: lower(t.name), alt: lower(alt) })
      .from(t)
      .where(
        this.active(tenantId, or(inArray(lower(t.name), wanted), inArray(lower(alt), wanted))),
      );
    const ids = new Map<string, number>();
    // A code / short-name match wins over a name match.
    for (const r of rows) ids.set(r.name, r.id as number);
    for (const r of rows) if (r.alt) ids.set(r.alt, r.id as number);
    return ids;
  }

  // ─── Writes ────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, input: Values) {
    const values = await this.resolveKeys(tenantId, input);
    const [row] = await this.insert(tenantId, userId, [values]);
    return { key: row!.key as string };
  }

  async update(tenantId: string, userId: string, key: string, input: Values) {
    const t = this.config.table;
    const values = await this.resolveKeys(tenantId, input);
    const [row] = await this.guard(() =>
      db
        .update(t)
        .set({ ...values, updatedBy: userId } as never)
        .where(this.active(tenantId, eq(t.key, key)))
        .returning({ key: t.key }),
    );
    if (!row) throw notFound(`${this.definition.label} not found`);
    return row as { key: string };
  }

  /** Flips the status of each row: active ↔ inactive. Returns how many were updated. */
  async toggleStatus(tenantId: string, userId: string, keys: string[]) {
    const t = this.config.table;
    const status = this.column('status');
    const rows = await db
      .update(t)
      .set({ status: sql`${STATUS.active} - ${status}`, updatedBy: userId } as never)
      .where(this.active(tenantId, inArray(t.key, keys)))
      .returning({ key: t.key });
    if (!rows.length) throw notFound(`${this.definition.label} not found`);
    return rows.length;
  }

  /** Soft-deletes the rows with these keys (and their cascaded rows). Returns how many were deleted. */
  async remove(tenantId: string, userId: string, keys: string[]) {
    const t = this.config.table;
    const found = await db
      .select({ id: t.id })
      .from(t)
      .where(this.active(tenantId, inArray(t.key, keys)));
    if (!found.length) throw notFound(`${this.definition.label} not found`);
    const ids = found.map((r) => r.id as number);
    await this.assertUnused(tenantId, ids);
    const deleted = { deletedAt: new Date(), deletedBy: userId } as never;
    await db.transaction(async (tx) => {
      await tx.update(t).set(deleted).where(inArray(t.id, ids));
      for (const { table, column } of this.config.cascade ?? []) {
        await tx
          .update(table)
          .set(deleted)
          .where(and(eq(table.tenantId, tenantId), isNull(table.deletedAt), inArray(column, ids)));
      }
    });
    return ids.length;
  }

  /** Inserts all rows or none. Returns how many were imported. */
  async import(tenantId: string, userId: string, rows: Values[]) {
    await this.assertUniqueRows(tenantId, rows);
    const values = await this.resolveNames(tenantId, rows);
    return (await this.insert(tenantId, userId, values)).length;
  }

  // ─── Images ────────────────────────────────────────────────────

  /** Replaces (or with `null`, removes) a row's image. Returns the new file name. */
  async setImage(
    tenantId: string,
    userId: string,
    key: string,
    image: { data: Buffer; type: ImageType } | null,
  ) {
    const t = this.config.table;
    const [row] = await db
      .select({ image: this.column('image') })
      .from(t)
      .where(this.active(tenantId, eq(t.key, key)))
      .limit(1);
    if (!row) throw notFound(`${this.definition.label} not found`);

    const file = image ? imageFileName(image.type) : null;
    if (image) await storage.put(this.imagePath(tenantId, file!), image.data);
    await db
      .update(t)
      .set({ image: file, updatedBy: userId } as never)
      .where(eq(t.key, key));
    if (row.image) await storage.remove(this.imagePath(tenantId, row.image as string));
    return file;
  }

  /** A row's image bytes and type, or null. */
  async image(tenantId: string, key: string) {
    const t = this.config.table;
    const [row] = await db
      .select({ image: this.column('image') })
      .from(t)
      .where(this.active(tenantId, eq(t.key, key)))
      .limit(1);
    const file = row?.image as string | null | undefined;
    if (!file) return null;
    const data = await storage.get(this.imagePath(tenantId, file));
    return data && { data, type: imageTypeOf(file) };
  }

  private imagePath(tenantId: string, file: string) {
    return `${this.resource}/${tenantId}/${file}`;
  }

  // ─── Queries ───────────────────────────────────────────────────

  private column(property: string) {
    return this.columns[property]!;
  }

  private active(tenantId: string, extra?: SQL) {
    const t = this.config.table;
    return and(eq(t.tenantId, tenantId), isNull(t.deletedAt), extra);
  }

  private search(q?: string) {
    if (!q) return undefined;
    const term = `%${escapeLike(q)}%`;
    return or(...this.config.search.map((c) => ilike(c, term)));
  }

  /** Search plus the advanced filters of `CATALOG[resource].filters` and the created-date range. */
  private filtered(tenant: Tenant, filters: CatalogFilters, extra?: SQL) {
    const t = this.config.table;
    const createdOn = sql`(${t.createdAt} at time zone ${tenant.timezone})::date`;
    const conditions: (SQL | undefined)[] = [
      extra,
      this.search(filters.q as string | undefined),
      filters.from ? sql`${createdOn} >= ${filters.from}` : undefined,
      filters.to ? sql`${createdOn} <= ${filters.to}` : undefined,
    ];
    for (const c of filterColumns(this.resource)) {
      if (c.ref) {
        const value = filters[c.csv] as string | undefined;
        if (value) conditions.push(this.refFilter(tenant.id, c.csv, fieldOf(c), value));
      } else if (c.input === 'number') {
        const min = filters[`${c.csv}Min`];
        const max = filters[`${c.csv}Max`];
        if (min !== undefined) conditions.push(gte(this.column(fieldOf(c)), min));
        if (max !== undefined) conditions.push(lte(this.column(fieldOf(c)), max));
      } else if (filters[c.csv] !== undefined) {
        conditions.push(eq(this.column(fieldOf(c)), filters[c.csv]));
      }
    }
    return this.active(tenant.id, and(...conditions));
  }

  /** Rows pointing at the referenced row with this key (of the same tenant). */
  private refFilter(tenantId: string, csv: string, field: string, key: string): SQL {
    const virtual = this.config.virtualFilters?.[csv];
    if (virtual) return virtual(tenantId, key);
    const [, ref] = this.references.find(([f]) => f === field)!;
    const target = ref.catalog.config.table;
    return inArray(
      ref.column,
      db
        .select({ id: target.id })
        .from(target)
        .where(and(eq(target.tenantId, tenantId), eq(target.key, key))),
    );
  }

  private rows(where: SQL | undefined) {
    const t = this.config.table;
    let query: PgSelect = db.select(this.config.fields).from(t).$dynamic();
    for (const join of this.config.joins ?? []) {
      query = join.left
        ? query.leftJoin(join.table, join.on)
        : query.innerJoin(join.table, join.on);
    }
    return query.where(where).orderBy(asc(t.name), asc(t.id));
  }

  /** Inserts rows and runs `onCreated` in one transaction. */
  private insert(tenantId: string, userId: string, values: Values[]) {
    const t = this.config.table;
    return this.guard(() =>
      db.transaction(async (tx) => {
        const inserted = await tx
          .insert(t)
          .values(
            values.map((v) => ({ ...v, tenantId, createdBy: userId, updatedBy: userId })) as never,
          )
          .returning({ id: t.id, key: t.key });
        await this.config.onCreated?.(
          tx,
          tenantId,
          userId,
          inserted.map((row, i) => ({ ...values[i], ...row })),
        );
        return inserted;
      }),
    );
  }

  // ─── References ────────────────────────────────────────────────

  /** Body keys (`categoryKey`) → foreign-key ids (`categoryId`); virtual fields are dropped. */
  private async resolveKeys(tenantId: string, input: Values): Promise<Values> {
    const values = { ...input };
    for (const c of this.definition.columns) if (c.virtual) delete values[fieldOf(c)];
    const errors: FieldErrors = {};
    await Promise.all(
      this.references.map(async ([field, ref, property]) => {
        const key = input[field] as string | null;
        delete values[field];
        const id = key ? await ref.catalog.idOf(tenantId, key) : null;
        if (key && !id) errors[field] = [`Choose a ${ref.catalog.definition.label.toLowerCase()}`];
        values[property] = id;
      }),
    );
    if (Object.keys(errors).length) throw validationError(errors);
    return values;
  }

  /** Import rows hold references as text (a code or name) → foreign-key ids. */
  private async resolveNames(tenantId: string, rows: Values[]): Promise<Values[]> {
    const values = rows.map((r) => ({ ...r }));
    const errors: FieldErrors = {};
    for (const [field, ref, property] of this.references) {
      const texts = rows.map((r) => r[field] as string | null);
      const ids = await ref.catalog.idsByName(
        tenantId,
        texts.filter((v): v is string => !!v),
        ref.matchBy,
      );
      texts.forEach((text, i) => {
        const row = values[i]!;
        delete row[field];
        row[property] = text ? (ids.get(text.toLowerCase()) ?? null) : null;
        if (text && !row[property]) {
          errors[`rows.${i}.${this.csvColumn(field)}`] = [
            `No ${ref.catalog.definition.label.toLowerCase()} "${text}"`,
          ];
        }
      });
    }
    if (Object.keys(errors).length)
      throw validationError(errors, 'Some rows could not be imported');
    return values;
  }

  private async assertUnused(tenantId: string, ids: number[]) {
    for (const use of this.config.usedBy ?? []) {
      const [used] = await db
        .select({ value: count() })
        .from(use.table)
        .where(
          and(
            eq(use.table.tenantId, tenantId),
            isNull(use.table.deletedAt),
            inArray(use.column, ids),
          ),
        );
      const n = used?.value ?? 0;
      if (n > 0) {
        const what = n === 1 ? 'it' : 'them';
        throw conflict(
          `${n} ${plural(n, use.label)} ${n === 1 ? 'uses' : 'use'} this ${this.definition.label.toLowerCase()}. Change or delete ${what} first.`,
          'IN_USE',
        );
      }
    }
  }

  // ─── Uniqueness ────────────────────────────────────────────────

  private label(field: string) {
    return this.definition.columns.find((c) => fieldOf(c) === field)?.label.toLowerCase() ?? field;
  }

  private csvColumn(field: string) {
    return this.definition.columns.find((c) => fieldOf(c) === field)?.csv ?? field;
  }

  /** Runs a write, turning a unique-index violation into a field error. */
  private async guard<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      const index = violatedIndex(err);
      if (index === null) throw err;
      const rule = this.config.unique.find((u) => u.index === index);
      const label = this.definition.label.toLowerCase();
      if (!rule) throw conflict(`This ${label} already exists`);
      throw validationError({
        [rule.field]: [`Another ${label} already uses this ${this.label(rule.field)}`],
      });
    }
  }

  /** Reports duplicates inside the file and against existing rows, with row numbers. */
  private async assertUniqueRows(tenantId: string, rows: Values[]) {
    const errors: FieldErrors = {};
    for (const rule of this.config.unique) {
      const column = this.csvColumn(rule.field);
      const seen = new Map<string, number>();
      rows.forEach((row, i) => {
        const value = row[rule.field];
        if (typeof value !== 'string') return;
        const normalized = value.toLowerCase();
        if (seen.has(normalized)) {
          (errors[`rows.${i}.${column}`] ??= []).push(
            `Duplicate of row ${seen.get(normalized)! + 1}`,
          );
        } else seen.set(normalized, i);
      });
      if (!seen.size) continue;
      const existing = await db
        .select({ value: lower(rule.column) })
        .from(this.config.table)
        .where(this.active(tenantId, inArray(lower(rule.column), [...seen.keys()])));
      for (const { value } of existing)
        (errors[`rows.${seen.get(value)}.${column}`] ??= []).push('Already exists');
    }
    if (Object.keys(errors).length)
      throw validationError(errors, 'Some rows could not be imported');
  }
}
