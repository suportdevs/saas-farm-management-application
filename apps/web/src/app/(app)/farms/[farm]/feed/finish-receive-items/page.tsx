import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PackageCheck, Search } from 'lucide-react';
import { FINISH_RECEIVE_STATUS, finishReceiveStatusLabel, type FinishReceiveItemListRow, type Pagination as PaginationInfo } from '@kit/shared';
import { CriteriaBar, exportCriteria, urlCriteria } from '@/components/app/criteria-bar';
import { FilterToggle } from '@/components/app/filter-toggle';
import { ModuleLocked } from '@/components/app/module-locked';
import { PageHeader } from '@/components/app/page-header';
import { PageSizeSelect } from '@/components/app/page-size-select';
import { Pagination } from '@/components/app/pagination';
import { TableFrame } from '@/components/app/table-frame';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { resolvePageSize } from '@/lib/page-size';
import { serverFetch } from '@/lib/session';
import { getFarmContext } from '@/modules/farms/server';
import { FinishReceiveItemsExport } from '@/modules/feed/components/finish-receive-items-export';
import { money } from '@/modules/feed/money';

export const metadata: Metadata = { title: 'Finish receive items' };

type Search = { q?: string; status?: string; from?: string; to?: string; page?: string; pageSize?: string };

/** Every finish receive line, with its receive: /farms/<farm>/feed/finish-receive-items. */
export default async function FinishReceiveItemsPage({ params, searchParams }: { params: Promise<{ farm: string }>; searchParams: Promise<Search> }) {
  const [{ farm: slug }, query] = await Promise.all([params, searchParams]);
  const ctx = await getFarmContext(slug);
  if (ctx.modules.feed !== 'enabled') return <ModuleLocked ctx={ctx} module="feed" />;
  if (!ctx.membership.permissions.includes('feed.finish_receive_list')) notFound();

  const base = `/farms/${slug}/feed/finish-receive-items`;
  const pageSize = String(await resolvePageSize(query.pageSize));
  const apiQuery = new URLSearchParams(Object.entries({ ...query, pageSize }).filter((e): e is [string, string] => !!e[1]));
  const data = (await serverFetch<{ rows: FinishReceiveItemListRow[]; pagination: PaginationInfo }>(`/farms/${slug}/feed/finish-receive-items?${apiQuery}`)) ?? {
    rows: [],
    pagination: { page: 1, pageSize: Number(pageSize), total: 0 },
  };
  const qs = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1] && e[0] !== 'page' && e[0] !== 'pageSize'));

  const criteria = urlCriteria(base, query, [
    ['Search', `“${query.q}”`, 'q'],
    ['Status', query.status ? finishReceiveStatusLabel(Number(query.status)) : '', 'status'],
    ['Receive date', query.from && query.to ? `${query.from} – ${query.to}` : query.from ? `from ${query.from}` : `up to ${query.to}`, 'from', 'to'],
  ]);

  return (
    <>
      <PageHeader compact eyebrow="Feed" title="Finish receive items" description="Every product line of every finish receive, with its order, warehouse and status." />
      <TableFrame
        criteria={<CriteriaBar total={data.pagination.total} {...criteria} />}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex flex-1 flex-wrap items-center gap-2" action={base}>
              {query.pageSize && <input type="hidden" name="pageSize" value={query.pageSize} />}
              <div className="relative min-w-60 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input name="q" defaultValue={query.q} placeholder="Search product or order no.…" className="h-8 pl-9 text-xs" />
              </div>
              <FilterToggle active={[query.status, query.from || query.to].filter(Boolean).length}>
                <Select className="h-8 text-xs" name="status" defaultValue={query.status ?? ''} aria-label="Status">
                  <option value="">Any status</option>
                  <option value={String(FINISH_RECEIVE_STATUS.pending)}>Pending</option>
                  <option value={String(FINISH_RECEIVE_STATUS.processed)}>Processed</option>
                </Select>
                <Input type="date" name="from" defaultValue={query.from} aria-label="From date" className="h-8 w-36 text-xs" />
                <span className="text-muted-foreground">–</span>
                <Input type="date" name="to" defaultValue={query.to} aria-label="To date" className="h-8 w-36 text-xs" />
              </FilterToggle>
              <Button type="submit" variant="outline" size="sm">
                Filter
              </Button>
            </form>
            <div className="flex items-center gap-2">
              <PageSizeSelect />
              <FinishReceiveItemsExport query={qs.toString()} criteria={exportCriteria(criteria.items)} />
            </div>
          </div>
        }
      >
        {data.rows.length === 0 ? (
          <EmptyState className="m-4" icon={PackageCheck} title={qs.toString() ? 'No items match' : 'No finish receive items yet'} description="Items appear here when a finish receive is saved." />
        ) : (
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Order no.</th>
                <th className="px-4 py-3 font-medium">Receive date</th>
                <th className="px-4 py-3 font-medium">Warehouse</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 text-right font-medium">Quantity</th>
                <th className="px-4 py-3 text-right font-medium">Rate</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.rows.map((r) => (
                <tr key={r.key} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/farms/${slug}/feed/finish-receives/${r.receiveKey}`} className="text-primary hover:underline">
                      {r.orderNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.receiveDate}</td>
                  <td className="px-4 py-3">{r.warehouseName}</td>
                  <td className="px-4 py-3">{r.productSizeName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.unitName ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.quantity.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(ctx.farm, r.rate)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{money(ctx.farm, r.price)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={r.status === FINISH_RECEIVE_STATUS.processed ? 'primary' : 'outline'}>{finishReceiveStatusLabel(r.status)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableFrame>
      <Pagination pagination={data.pagination} basePath={base} params={{ q: query.q, status: query.status, from: query.from, to: query.to, pageSize: query.pageSize }} />
    </>
  );
}
