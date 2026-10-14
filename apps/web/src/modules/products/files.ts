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
import { printTable } from '@/lib/print';

/**
 * Export, print and the import template. All use the catalog's columns, so an
 * exported file can be imported again as-is.
 */

/** A row's value for a column key, as text. */
export const rowValue = (row: CatalogRow, key: string) =>
  String((row as unknown as Record<string, unknown>)[key] ?? '');

/** A cell as people read it — status as Active/Inactive (also accepted by import). */
export const displayValue = (row: CatalogRow, c: CatalogColumn) =>
  c.input === 'status' ? statusLabel(rowValue(row, c.key)) : rowValue(row, c.key);

/** URL of a row's image; the file name is the cache-busting version. */
export const imageUrl = (farmSlug: string, resource: CatalogResource, row: CatalogRow) => {
  const image = rowValue(row, 'image');
  return image
    ? `/api/farms/${farmSlug}/${catalogPath(resource)}/${row.key}/image?v=${image}`
    : null;
};

const today = () => new Date().toISOString().slice(0, 10);
const cells = (resource: CatalogResource, rows: CatalogRow[]) =>
  rows.map((row) => CATALOG[resource].columns.map((c) => displayValue(row, c)));

export function exportCatalog(resource: CatalogResource, rows: CatalogRow[]) {
  const { columns } = CATALOG[resource];
  downloadFile(
    `${resource}-${today()}.csv`,
    toCsv(
      columns.map((c) => c.csv),
      cells(resource, rows),
    ),
  );
}

export function printCatalog(resource: CatalogResource, rows: CatalogRow[], farmName: string) {
  const { plural, columns } = CATALOG[resource];
  printTable({
    title: plural,
    subtitle: `${farmName} · ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} · ${new Date().toLocaleDateString()}`,
    headers: columns.map((c) => c.label),
    rows: cells(resource, rows),
  });
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
