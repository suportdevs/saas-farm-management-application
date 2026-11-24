'use client';

import type { Pagination, PurchaseRow } from '@kit/shared';
import { ExportMenu } from '@/components/app/export-menu';
import { api } from '@/lib/api';
import type { ExportCriterion } from '@/lib/table-export';
import { useCan, useFarm } from '@/modules/farms/context';
import { useExportLock } from '@/modules/subscriptions/use-export-lock';
import { sourceLabel } from '../money';

/** Download menu over every purchase matching the list's search and filters. */
export function PurchasesExport({ query, criteria }: { query: string; criteria: ExportCriterion[] }) {
  const { farm } = useFarm();
  const canExport = useCan('purchase.purchase_export');
  const lock = useExportLock();

  const load = async () => {
    const qs = new URLSearchParams(query);
    qs.set('page', '1');
    qs.set('pageSize', '1000');
    const { rows } = await api.get<{ rows: PurchaseRow[]; pagination: Pagination }>(`/farms/${farm.slug}/purchases?${qs}`);
    return {
      filename: 'purchases',
      title: 'Purchases',
      criteria,
      headers: ['Purchase no.', 'Date', 'Source', 'Haat', 'Supplier', 'Broker', 'Batch', 'Animals', 'Total price', 'Transport', 'Broker fee', 'Toll', 'Other', 'Shared cost', 'Landed total', 'Notes'],
      rows: rows.map((p) => [
        p.number,
        p.purchaseDate,
        sourceLabel(p.sourceType),
        p.haatName ?? '',
        p.supplierName ?? '',
        p.brokerName ?? '',
        p.batchName ?? '',
        p.animals,
        p.totalPrice,
        p.transportCost,
        p.brokerFee,
        p.tollCost,
        p.otherCost,
        p.sharedCost,
        p.totalLanded,
        p.notes ?? '',
      ]),
    };
  };

  if (canExport) return <ExportMenu load={load} />;
  // The plan has no data export: show it locked, with an upgrade link.
  return lock ? <ExportMenu load={load} locked={lock} /> : null;
}
