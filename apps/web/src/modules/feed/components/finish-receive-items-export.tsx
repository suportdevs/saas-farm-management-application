'use client';

import { finishReceiveStatusLabel, type FinishReceiveItemListRow, type Pagination } from '@kit/shared';
import { ExportMenu } from '@/components/app/export-menu';
import { api } from '@/lib/api';
import type { ExportCriterion } from '@/lib/table-export';
import { useCan, useFarm } from '@/modules/farms/context';
import { useExportLock } from '@/modules/subscriptions/use-export-lock';

/** Download menu over every finish receive line matching the list's search and filters. */
export function FinishReceiveItemsExport({ query, criteria }: { query: string; criteria: ExportCriterion[] }) {
  const { farm } = useFarm();
  const canExport = useCan('feed.finish_receive_export');
  const lock = useExportLock();

  const load = async () => {
    const qs = new URLSearchParams(query);
    qs.set('page', '1');
    qs.set('pageSize', '1000');
    const { rows } = await api.get<{ rows: FinishReceiveItemListRow[]; pagination: Pagination }>(`/farms/${farm.slug}/feed/finish-receive-items?${qs}`);
    return {
      filename: 'finish-receive-items',
      title: 'Finish receive items',
      criteria,
      headers: ['Order no.', 'Receive date', 'Warehouse', 'Product', 'Unit', 'Quantity', 'Rate', 'Amount', 'Status'],
      rows: rows.map((r) => [r.orderNo, r.receiveDate, r.warehouseName, r.productSizeName, r.unitName ?? '', r.quantity, r.rate, r.price, finishReceiveStatusLabel(r.status)]),
    };
  };

  if (canExport) return <ExportMenu load={load} />;
  return lock ? <ExportMenu load={load} locked={lock} /> : null;
}
