import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus, Search, ShoppingCart } from 'lucide-react';
import { PURCHASE_SOURCE_TYPES } from '@kit/shared';
import { CriteriaBar } from '@/components/app/criteria-bar';
import { exportCriteria, urlCriteria } from '@/components/app/criteria';
import { FilterToggle } from '@/components/app/filter-toggle';
import { PageHeader } from '@/components/app/page-header';
import { PageSizeSelect } from '@/components/app/page-size-select';
import { ColumnToggle } from '@/components/app/column-toggle';
import { Pagination } from '@/components/app/pagination';
import { TableFrame } from '@/components/app/table-frame';
import { Button, buttonClasses } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { resolvePageSize } from '@/lib/page-size';
import { getT } from '@/i18n/server';
import { getFarmContext } from '@/modules/farms/server';
import { PurchasesExport } from '@/modules/purchases/components/purchases-export';
import { money, sourceLabel } from '@/modules/purchases/money';
import { getPurchases, optionName } from '@/modules/purchases/server';
import { CatalogFilterSelect } from '@/modules/products/components/catalog-filter-select';

export const metadata: Metadata = { title: 'Purchases' };

type Search = { q?: string; source_type?: string; from?: string; to?: string; batch?: string; supplier?: string; broker?: string; page?: string; pageSize?: string };

/** Animal purchases: /farms/<farm>/purchases. */
export default async function PurchasesPage({ params, searchParams }: { params: Promise<{ farm: string }>; searchParams: Promise<Search> }) {
  const [{ farm: slug }, query] = await Promise.all([params, searchParams]);
  const ctx = await getFarmContext(slug);
  const t = await getT(slug);
  const can = (p: string) => ctx.membership.permissions.includes(p as never);
  if (!can('purchase.purchase_list')) notFound();

  const pageSize = String(await resolvePageSize(query.pageSize));
  const { rows, pagination } = await getPurchases(slug, { ...query, pageSize });
  const base = `/farms/${slug}/purchases`;
  const qs = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1] && e[0] !== 'page' && e[0] !== 'pageSize'));

  // Names of the chosen batch / supplier / broker: for the chips and the selects.
  const [batchName, supplierName, brokerName] = await Promise.all([
    optionName(slug, 'batches', query.batch),
    optionName(slug, 'suppliers', query.supplier),
    optionName(slug, 'suppliers', query.broker),
  ]);
  const names = { batch: batchName, supplier: supplierName, broker: brokerName };

  // Search / filters in use: chips above the table and on the download header.
  const criteria = urlCriteria(base, query, [
    ['Search', `“${query.q}”`, 'q'],
    ['Source', sourceLabel(query.source_type ?? ''), 'source_type'],
    ['Date', query.from && query.to ? `${query.from} – ${query.to}` : query.from ? `from ${query.from}` : `up to ${query.to}`, 'from', 'to'],
    ['Batch', names.batch ?? '', 'batch'],
    ['Supplier', names.supplier ?? '', 'supplier'],
    ['Broker', names.broker ?? '', 'broker'],
  ]);

  return (
    <>
      <PageHeader
        compact
        eyebrow={t("Business")}
        title={t("Purchases")}
        description={t("Animals bought — at a haat, from farmers or suppliers, or imported — with shared costs split per animal.")}
        actions={
          can('purchase.purchase_create') && (
            <Link href={`${base}/new`} className={buttonClasses('primary')}>
              <Plus className="h-4 w-4" /> {t("New purchase")}
            </Link>
          )
        }
      />
      <TableFrame columns="purchases"
        criteria={<CriteriaBar total={pagination.total} {...criteria} />}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex flex-1 flex-wrap items-center gap-2" action={base}>
              {query.pageSize && <input type="hidden" name="pageSize" value={query.pageSize} />}
              <div className="relative min-w-60 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input name="q" defaultValue={query.q} placeholder={t("Search purchase no. or haat…")} className="h-8 pl-9 text-xs" />
              </div>
              <FilterToggle active={[query.source_type, query.from || query.to, query.batch, query.supplier, query.broker].filter(Boolean).length}>
                <Select className="h-8 text-xs" name="source_type" defaultValue={query.source_type ?? ''} aria-label={t("Source")}>
                  <option value="">{t("Any source")}</option>
                  {PURCHASE_SOURCE_TYPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {t(s.label)}
                    </option>
                  ))}
                </Select>
                <Input type="date" name="from" defaultValue={query.from} aria-label={t("From date")} className="h-8 w-36 text-xs" />
                <span className="text-muted-foreground">–</span>
                <Input type="date" name="to" defaultValue={query.to} aria-label={t("To date")} className="h-8 w-36 text-xs" />
                <CatalogFilterSelect resource="batches" name="batch" defaultValue={query.batch} label={names.batch} placeholder="Any batch" />
                <CatalogFilterSelect resource="suppliers" name="supplier" defaultValue={query.supplier} label={names.supplier} placeholder="Any supplier" />
                <CatalogFilterSelect resource="suppliers" name="broker" defaultValue={query.broker} label={names.broker} placeholder="Any broker" />
              </FilterToggle>
              <Button type="submit" variant="outline" size="sm">
                {t("Filter")}
              </Button>
            </form>
            <div className="flex items-center gap-2">
              <PageSizeSelect />
              <ColumnToggle />
              <PurchasesExport query={qs.toString()} criteria={exportCriteria(criteria.items)} />
            </div>
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState className="m-4" icon={ShoppingCart} title={qs.toString() ? t('No purchases match') : t('No purchases yet')} description={t("Record a purchase to add the animals to the herd with their landed cost.")} />
        ) : (
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("Purchase no.")}</th>
                <th className="px-4 py-3 font-medium">{t("Date")}</th>
                <th className="px-4 py-3 font-medium">{t("Source")}</th>
                <th className="px-4 py-3 font-medium">{t("Supplier")}</th>
                <th className="px-4 py-3 font-medium">{t("Batch")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("Animals")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("Total price")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("Shared cost")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("Landed total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((p) => (
                <tr key={p.key} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`${base}/${p.key}`} className="text-primary hover:underline">
                      {p.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.purchaseDate}</td>
                  <td className="px-4 py-3">
                    {t(sourceLabel(p.sourceType))}
                    {p.haatName && <span className="block text-xs text-muted-foreground">{p.haatName}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.supplierName ?? '—'}
                    {p.brokerName && <span className="block text-xs text-muted-foreground">{t('Broker: {name}', { name: p.brokerName })}</span>}
                  </td>
                  <td className="px-4 py-3">{p.batchName ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.animals}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(ctx.farm, p.totalPrice)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{money(ctx.farm, p.sharedCost)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{money(ctx.farm, p.totalLanded)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableFrame>
      <Pagination pagination={pagination} basePath={base} params={{ q: query.q, source_type: query.source_type, from: query.from, to: query.to, batch: query.batch, supplier: query.supplier, broker: query.broker, pageSize: query.pageSize }} />
    </>
  );
}
