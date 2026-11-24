import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PackageCheck, Plus, Search } from 'lucide-react';
import { FINISH_RECEIVE_STATUS, finishReceiveStatusLabel } from '@kit/shared';
import { CriteriaBar, exportCriteria, urlCriteria } from '@/components/app/criteria-bar';
import { FilterToggle } from '@/components/app/filter-toggle';
import { ModuleLocked } from '@/components/app/module-locked';
import { PageHeader } from '@/components/app/page-header';
import { PageSizeSelect } from '@/components/app/page-size-select';
import { Pagination } from '@/components/app/pagination';
import { TableFrame } from '@/components/app/table-frame';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { resolvePageSize } from '@/lib/page-size';
import { getFarmContext } from '@/modules/farms/server';
import { FinishReceivesExport } from '@/modules/feed/components/finish-receives-export';
import { money } from '@/modules/feed/money';
import { getFinishReceives } from '@/modules/feed/server';

export const metadata: Metadata = { title: 'Finish receives' };

type Search = { q?: string; status?: string; from?: string; to?: string; page?: string; pageSize?: string };

/** Finished goods received into warehouses: /farms/<farm>/feed/finish-receives. */
export default async function FinishReceivesPage({ params, searchParams }: { params: Promise<{ farm: string }>; searchParams: Promise<Search> }) {
  const [{ farm: slug }, query] = await Promise.all([params, searchParams]);
  const ctx = await getFarmContext(slug);
  // Not in the plan or switched off: explain instead of a 404.
  if (ctx.modules.feed !== 'enabled') return <ModuleLocked ctx={ctx} module="feed" />;
  const can = (p: string) => ctx.membership.permissions.includes(p as never);
  if (!can('feed.finish_receive_list')) notFound();

  const pageSize = String(await resolvePageSize(query.pageSize));
  const { rows, pagination } = await getFinishReceives(slug, { ...query, pageSize });
  const base = `/farms/${slug}/feed/finish-receives`;
  const qs = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1] && e[0] !== 'page' && e[0] !== 'pageSize'));

  // Search / filters in use: chips above the table and on the download header.
  const criteria = urlCriteria(base, query, [
    ['Search', `“${query.q}”`, 'q'],
    ['Status', query.status ? finishReceiveStatusLabel(Number(query.status)) : '', 'status'],
    ['Receive date', query.from && query.to ? `${query.from} – ${query.to}` : query.from ? `from ${query.from}` : `up to ${query.to}`, 'from', 'to'],
  ]);

  return (
    <>
      <PageHeader
        compact
        eyebrow="Feed"
        title="Finish receives"
        description="Finished feed and goods received into a warehouse against an order. Pending until processed."
        actions={
          can('feed.finish_receive_create') && (
            <Link href={`${base}/new`} className={buttonClasses('primary')}>
              <Plus className="h-4 w-4" /> New finish receive
            </Link>
          )
        }
      />
      <TableFrame
        criteria={<CriteriaBar total={pagination.total} {...criteria} />}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex flex-1 flex-wrap items-center gap-2" action={base}>
              {query.pageSize && <input type="hidden" name="pageSize" value={query.pageSize} />}
              <div className="relative min-w-60 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input name="q" defaultValue={query.q} placeholder="Search order no. or note…" className="h-8 pl-9 text-xs" />
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
              <FinishReceivesExport query={qs.toString()} criteria={exportCriteria(criteria.items)} />
            </div>
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState className="m-4" icon={PackageCheck} title={qs.toString() ? 'No finish receives match' : 'No finish receives yet'} description="Record goods received into a warehouse, then process them when checked." />
        ) : (
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Order no.</th>
                <th className="px-4 py-3 font-medium">Receive date</th>
                <th className="px-4 py-3 font-medium">Warehouse</th>
                <th className="px-4 py-3 font-medium">Received by</th>
                <th className="px-4 py-3 text-right font-medium">Lines</th>
                <th className="px-4 py-3 text-right font-medium">Quantity</th>
                <th className="px-4 py-3 text-right font-medium">Total price</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`${base}/${r.key}`} className="text-primary hover:underline">
                      {r.orderNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.receiveDate}</td>
                  <td className="px-4 py-3">{r.warehouseName}</td>
                  <td className="px-4 py-3">{r.receivedByName ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.items}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.totalQuantity.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{money(ctx.farm, r.totalPrice)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={r.status === FINISH_RECEIVE_STATUS.processed ? 'primary' : 'outline'}>{finishReceiveStatusLabel(r.status)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableFrame>
      <Pagination pagination={pagination} basePath={base} params={{ q: query.q, status: query.status, from: query.from, to: query.to, pageSize: query.pageSize }} />
    </>
  );
}
