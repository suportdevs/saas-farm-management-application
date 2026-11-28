'use client';

import { ANIMAL_SEXES, ANIMAL_TYPES, choiceLabel, type Pagination, type PurchaseItemListRow } from '@kit/shared';
import { ExportMenu } from '@/components/app/export-menu';
import { api } from '@/lib/api';
import type { ExportCriterion } from '@/lib/table-export';
import { useCan, useFarm } from '@/modules/farms/context';
import { useExportLock } from '@/modules/subscriptions/use-export-lock';
import { sourceLabel } from '../money';

/** Download menu over every purchase line matching the list's search and filters. */
export function PurchaseItemsExport({ query, criteria }: { query: string; criteria: ExportCriterion[] }) {
  const { farm } = useFarm();
  const canExport = useCan('purchase.purchase_export');
  const lock = useExportLock();

  const load = async () => {
    const qs = new URLSearchParams(query);
    qs.set('page', '1');
    qs.set('pageSize', '1000');
    const { rows } = await api.get<{ rows: PurchaseItemListRow[]; pagination: Pagination }>(`/farms/${farm.slug}/purchase-items?${qs}`);
    return {
      filename: 'purchase-items',
      title: 'Purchase items',
      criteria,
      // Same names as the table headers, so hidden columns can be left out.
      headers: ['Purchase no.', 'Date', 'Source', 'Supplier', 'Batch', 'Ear tag', 'Name', 'Sex', 'Type', 'Breed', 'Entry weight (kg)', 'Price', 'Shared cost', 'Landed cost'],
      rows: rows.map((r) => [
        r.number,
        r.purchaseDate,
        sourceLabel(r.sourceType),
        r.supplierName ?? '',
        r.batchName ?? '',
        r.tag,
        r.name ?? '',
        choiceLabel(ANIMAL_SEXES, r.sex),
        r.type ? choiceLabel(ANIMAL_TYPES, r.type) : '',
        r.breed ?? '',
        r.entryWeightKg ?? '',
        r.price,
        r.allocatedSharedCost,
        r.landedCost,
      ]),
    };
  };

  if (canExport) return <ExportMenu load={load} />;
  // The plan has no data export: show it locked, with an upgrade link.
  return lock ? <ExportMenu load={load} locked={lock} /> : null;
}
