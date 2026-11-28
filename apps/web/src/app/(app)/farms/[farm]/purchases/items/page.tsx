import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Search, ShoppingCart } from 'lucide-react';
import { ANIMAL_SEXES, ANIMAL_TYPES, choiceLabel, PURCHASE_SOURCE_TYPES } from '@kit/shared';
import { ColumnToggle } from '@/components/app/column-toggle';
import { CriteriaBar } from '@/components/app/criteria-bar';
import { exportCriteria, urlCriteria } from '@/components/app/criteria';
import { FilterToggle } from '@/components/app/filter-toggle';
import { PageHeader } from '@/components/app/page-header';
import { PageSizeSelect } from '@/components/app/page-size-select';
import { Pagination } from '@/components/app/pagination';
import { TableFrame } from '@/components/app/table-frame';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { resolvePageSize } from '@/lib/page-size';
import { getT } from '@/i18n/server';
import { getFarmContext } from '@/modules/farms/server';
import { PurchaseItemsExport } from '@/modules/purchases/components/purchase-items-export';
import { money, sourceLabel } from '@/modules/purchases/money';
import { getPurchaseItems, optionName } from '@/modules/purchases/server';
import { CatalogFilterSelect } from '@/modules/products/components/catalog-filter-select';

export const metadata: Metadata = { title: 'Purchase items' };

type Search = { q?: string; source_type?: string; from?: string; to?: string; batch?: string; supplier?: string; broker?: string; type?: string; animal?: string; page?: string; pageSize?: string };

/** Every animal bought, with its purchase: /farms/<farm>/purchases/items. */
export default async function PurchaseItemsPage({ params, searchParams }: { params: Promise<{ farm: string }>; searchParams: Promise<Search> }) {
  const [{ farm: slug }, query] = await Promise.all([params, searchParams]);
  const ctx = await getFarmContext(slug);
  const t = await getT(slug);
  if (!ctx.membership.permissions.includes('purchase.purchase_list')) notFound();

  const pageSize = String(await resolvePageSize(query.pageSize));
  const { rows, pagination } = await getPurchaseItems(slug, { ...query, pageSize });
  const base = `/farms/${slug}/purchases/items`;
  const qs = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1] && e[0] !== 'page' && e[0] !== 'pageSize'));

  // Names of the chosen batch / supplier / broker / animal: for the chips and the selects.
  const [batchName, supplierName, brokerName, animalName] = await Promise.all([
    optionName(slug, 'batches', query.batch),
    optionName(slug, 'suppliers', query.supplier),
    optionName(slug, 'suppliers', query.broker),
    optionName(slug, 'animals', query.animal),
  ]);
  const names = { batch: batchName, supplier: supplierName, broker: brokerName, animal: animalName };

  // Search / filters in use: chips above the table and on the download header.
  const criteria = urlCriteria(base, query, [
    ['Search', `“${query.q}”`, 'q'],
    ['Source', sourceLabel(query.source_type ?? ''), 'source_type'],
    ['Date', query.from && query.to ? `${query.from} – ${query.to}` : query.from ? `from ${query.from}` : `up to ${query.to}`, 'from', 'to'],
    ['Batch', names.batch ?? '', 'batch'],
    ['Supplier', names.supplier ?? '', 'supplier'],
    ['Broker', names.broker ?? '', 'broker'],
    ['Animal type', query.type ? choiceLabel(ANIMAL_TYPES, query.type) : '', 'type'],
    ['Animal', names.animal ?? '', 'animal'],
  ]);

  return (
    <>
      <PageHeader compact eyebrow={t('Purchases')} title={t('Purchase items')} description={t('Every animal bought, with its purchase, price, shared cost and landed cost.')} />
      <TableFrame
        columns="purchase-items"
        criteria={<CriteriaBar total={pagination.total} {...criteria} />}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex flex-1 flex-wrap items-center gap-2" action={base}>
              {query.pageSize && <input type="hidden" name="pageSize" value={query.pageSize} />}
              <div className="relative min-w-60 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input name="q" defaultValue={query.q} placeholder={t('Search purchase no., ear tag or haat…')} className="h-8 pl-9 text-xs" />
              </div>
              <FilterToggle active={[query.source_type, query.from || query.to, query.batch, query.supplier, query.broker, query.type, query.animal].filter(Boolean).length}>
                <Select className="h-8 text-xs" name="source_type" defaultValue={query.source_type ?? ''} aria-label={t('Source')}>
                  <option value="">{t('Any source')}</option>
                  {PURCHASE_SOURCE_TYPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {t(s.label)}
                    </option>
                  ))}
                </Select>
                <Input type="date" name="from" defaultValue={query.from} aria-label={t('From date')} className="h-8 w-36 text-xs" />
                <span className="text-muted-foreground">–</span>
                <Input type="date" name="to" defaultValue={query.to} aria-label={t('To date')} className="h-8 w-36 text-xs" />
                <CatalogFilterSelect resource="batches" name="batch" defaultValue={query.batch} label={names.batch} placeholder="Any batch" />
                <CatalogFilterSelect resource="suppliers" name="supplier" defaultValue={query.supplier} label={names.supplier} placeholder="Any supplier" />
                <CatalogFilterSelect resource="suppliers" name="broker" defaultValue={query.broker} label={names.broker} placeholder="Any broker" />
                <Select className="h-8 text-xs" name="type" defaultValue={query.type ?? ''} aria-label={t('Animal type')}>
                  <option value="">{t('Any animal type')}</option>
                  {ANIMAL_TYPES.map((tp) => (
                    <option key={tp.value} value={tp.value}>
                      {t(tp.label)}
                    </option>
                  ))}
                </Select>
                <CatalogFilterSelect resource="animals" name="animal" defaultValue={query.animal} label={names.animal} placeholder="Any animal" />
              </FilterToggle>
              <Button type="submit" variant="outline" size="sm">
                {t('Filter')}
              </Button>
            </form>
            <div className="flex items-center gap-2">
              <PageSizeSelect />
              <ColumnToggle />
              <PurchaseItemsExport query={qs.toString()} criteria={exportCriteria(criteria.items)} />
            </div>
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState className="m-4" icon={ShoppingCart} title={qs.toString() ? t('No items match') : t('No purchase items yet')} description={t('Animals appear here when a purchase is saved.')} />
        ) : (
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('Purchase no.')}</th>
                <th className="px-4 py-3 font-medium">{t('Date')}</th>
                <th className="px-4 py-3 font-medium">{t('Source')}</th>
                <th className="px-4 py-3 font-medium">{t('Supplier')}</th>
                <th className="px-4 py-3 font-medium">{t('Batch')}</th>
                <th className="px-4 py-3 font-medium">{t('Ear tag')}</th>
                <th className="px-4 py-3 font-medium">{t('Name')}</th>
                <th className="px-4 py-3 font-medium">{t('Sex')}</th>
                <th className="px-4 py-3 font-medium">{t('Type')}</th>
                <th className="px-4 py-3 font-medium">{t('Breed')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Entry weight (kg)')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Price')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Shared cost')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Landed cost')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/farms/${slug}/purchases/${r.purchaseKey}`} className="text-primary hover:underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.purchaseDate}</td>
                  <td className="px-4 py-3">
                    {t(sourceLabel(r.sourceType))}
                    {r.haatName && <span className="block text-xs text-muted-foreground">{r.haatName}</span>}
                  </td>
                  <td className="px-4 py-3">{r.supplierName ?? '—'}</td>
                  <td className="px-4 py-3">{r.batchName ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">{r.tag}</td>
                  <td className="px-4 py-3">{r.name ?? '—'}</td>
                  <td className="px-4 py-3">{t(choiceLabel(ANIMAL_SEXES, r.sex))}</td>
                  <td className="px-4 py-3">{r.type ? t(choiceLabel(ANIMAL_TYPES, r.type)) : '—'}</td>
                  <td className="px-4 py-3">{r.breed ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.entryWeightKg ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(ctx.farm, r.price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{money(ctx.farm, r.allocatedSharedCost)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{money(ctx.farm, r.landedCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableFrame>
      <Pagination pagination={pagination} basePath={base} params={{ q: query.q, source_type: query.source_type, from: query.from, to: query.to, batch: query.batch, supplier: query.supplier, broker: query.broker, type: query.type, animal: query.animal, pageSize: query.pageSize }} />
    </>
  );
}
