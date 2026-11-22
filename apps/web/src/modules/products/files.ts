import {
  CATALOG,
  catalogPath,
  importColumns,
  statusLabel,
  type CatalogColumn,
  type CatalogResource,
  type CatalogRow,
} from '@kit/shared';
import { downloadFile, toCsv } from '@/lib/csv';
import type { ExportFormat, ExportTable } from '@/lib/table-export';

/**
 * Export, print and the import template. All use the catalog's columns, so an
 * exported file can be imported again as-is.
 */

/** A row's value for a column key, as text. */
export const rowValue = (row: CatalogRow, key: string) =>
  String((row as unknown as Record<string, unknown>)[key] ?? '');

/** A cell as people read it — status as Active/Inactive, a select as its label (both accepted by import). */
export function displayValue(row: CatalogRow, c: CatalogColumn) {
  const value = rowValue(row, c.key);
  if (c.input === 'status') return statusLabel(value);
  if (c.input === 'select') return c.options?.find((o) => o.value === value)?.label ?? value;
  return value;
}

/** URL of a row's image; the file name is the cache-busting version. */
export const imageUrl = (farmSlug: string, resource: CatalogResource, row: CatalogRow) => {
  const image = rowValue(row, 'image');
  return image
    ? `/api/farms/${farmSlug}/${catalogPath(resource)}/${row.key}/image?v=${image}`
    : null;
};

/**
 * A catalog export in the picked format. CSV and Excel carry every column
 * (CSV with the import headers, so it can be imported again); PDF, print and
 * copy show the list columns, as on screen.
 */
export function catalogExportTable(resource: CatalogResource, rows: CatalogRow[], farmName: string, format: ExportFormat): ExportTable {
  const { plural, columns } = CATALOG[resource];
  const shown = ['csv', 'excel', 'tsv', 'json'].includes(format) ? columns : columns.filter((c) => c.list !== false);
  return {
    filename: resource,
    title: plural,
    subtitle: `${farmName} · ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} · ${new Date().toLocaleDateString()}`,
    headers: shown.map((c) => (format === 'csv' ? c.csv : c.label)),
    rows: rows.map((row) => shown.map((c) => displayValue(row, c))),
  };
}

export function downloadImportTemplate(resource: CatalogResource) {
  const columns = importColumns(resource);
  downloadFile(
    `${resource}-import-template.csv`,
    toCsv(
      columns.map((c) => c.csv),
      [columns.map((c) => c.example)],
    ),
  );
}
