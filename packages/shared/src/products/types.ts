import type { Pagination } from '../core/types';
import type { Status } from './catalog';

/** Rows as listed by the API — only the columns the catalog screens use. */
export interface UnitRow {
  key: string;
  name: string;
  shortName: string;
  description: string | null;
}

export interface SizeRow {
  key: string;
  name: string;
  shortName: string | null;
  weight: number | null;
  description: string | null;
}

export interface CodedRow {
  key: string;
  name: string;
  code: string | null;
  description: string | null;
}

export type ColorRow = CodedRow;
export type BrandRow = CodedRow;
export type CategoryRow = CodedRow;

export interface ProductRow {
  key: string;
  name: string;
  code: string;
  status: Status;
  description: string | null;
  /** Image file name (also its cache-busting version), or null. */
  image: string | null;
  categoryKey: string;
  categoryName: string;
  brandKey: string | null;
  brandName: string | null;
  unitKey: string;
  /** The unit's short name, e.g. "kg". */
  unitName: string;
}

export interface ProductSizeRow {
  key: string;
  name: string;
  code: string | null;
  status: Status;
  categoryKey: string;
  categoryName: string;
  productKey: string;
  productName: string;
  /** Null for the product's default size. */
  sizeKey: string | null;
  sizeName: string | null;
  unitKey: string | null;
  unitName: string | null;
}

export type CatalogRow = UnitRow | SizeRow | CodedRow | ProductRow | ProductSizeRow;

/** A choice in a searchable reference select. */
export interface CatalogOption {
  key: string;
  name: string;
}

export interface CatalogPage<T = CatalogRow> {
  rows: T[];
  pagination: Pagination;
}
