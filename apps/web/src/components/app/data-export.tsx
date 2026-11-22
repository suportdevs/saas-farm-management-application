'use client';

import { ExportMenu } from '@/components/app/export-menu';
import type { ExportTable } from '@/lib/table-export';

/**
 * Download menu for rows that are already on the page. Works from server
 * pages too, because the table is plain data:
 *   <DataExport table={{ filename: 'members', title: 'Members', headers, rows }} />
 */
export function DataExport({ table }: { table: ExportTable }) {
  return <ExportMenu disabled={table.rows.length === 0} load={async () => table} />;
}
