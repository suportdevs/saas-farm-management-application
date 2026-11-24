'use client';

import { finishReceiveStatusLabel, type FinishReceiveRow, type Pagination } from '@kit/shared';
import { ExportMenu } from '@/components/app/export-menu';
import { api } from '@/lib/api';
import type { ExportCriterion } from '@/lib/table-export';
import { useCan, useFarm } from '@/modules/farms/context';
import { useExportLock } from '@/modules/subscriptions/use-export-lock';

/** Download menu over every finish receive matching the list's search and filters. */
export function FinishReceivesExport({ query, criteria }: { query: string; criteria: ExportCriterion[] }) {
  const { farm } = useFarm();
  const canExport = useCan('feed.finish_receive_export');
  const lock = useExportLock();

  const load = async () => {
    const qs = new URLSearchParams(query);
    qs.set('page', '1');
    qs.set('pageSize', '1000');
    const { rows } = await api.get<{ rows: FinishReceiveRow[]; pagination: Pagination }>(`/farms/${farm.slug}/feed/finish-receives?${qs}`);
    return {
      filename: 'finish-receives',
      title: 'Finish receives',
      criteria,
      headers: ['Order no.', 'Receive date', 'Warehouse', 'Received by', 'Lines', 'Total quantity', 'Total price', 'Status', 'Note'],
      rows: rows.map((r) => [r.orderNo, r.receiveDate, r.warehouseName, r.receivedByName ?? '', r.items, r.totalQuantity, r.totalPrice, finishReceiveStatusLabel(r.status), r.note ?? '']),
    };
  };

  if (canExport) return <ExportMenu load={load} />;
  // The plan has no data export: show it locked, with an upgrade link.
  return lock ? <ExportMenu load={load} locked={lock} /> : null;
}
