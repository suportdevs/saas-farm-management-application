import type { Metadata } from 'next';
import Link from 'next/link';
import { CreditCard, Search } from 'lucide-react';
import { type Pagination as PaginationInfo, type PlatformSubscription } from '@kit/shared';
import { SubscriptionsExport } from '@/components/admin/list-exports';
import { Pagination } from '@/components/app/pagination';
import { FilterToggle } from '@/components/app/filter-toggle';
import { PageSizeSelect } from '@/components/app/page-size-select';
import { CriteriaBar, exportCriteria, urlCriteria } from '@/components/app/criteria-bar';
import { TableFrame } from '@/components/app/table-frame';
import { resolvePageSize } from '@/lib/page-size';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { flag, formatDate, formatMoney } from '@/lib/format';
import { requireAdmin, serverFetch } from '@/lib/session';
import { getAdminPlans } from '@/modules/subscriptions/server';
import { RecordPaymentButton } from '@/modules/platform/components/manual-payment-dialog';

export const metadata: Metadata = { title: 'Subscriptions · Admin' };

type Search = { q?: string; plan?: string; state?: string; source?: string; billing?: string; page?: string; pageSize?: string };

/** Labels for the criteria bar. */
const STATE_LABEL: Record<string, string> = { active: 'Active', trialing: 'Trialing', past_due: 'Past due', free: 'Free', canceled: 'Canceled' };
const SOURCE_LABEL: Record<string, string> = { manual: 'Manual (invoice)', stripe: 'Stripe (card)', none: 'Not paying' };
const BILLING_LABEL: Record<string, string> = { unpaid: 'Has unpaid invoices', overdue: 'Has overdue invoices' };

const STATE_BADGE: Record<string, 'success' | 'info' | 'warning' | 'default' | 'destructive'> = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  free: 'default',
  canceled: 'destructive',
};

/** Every tenant's subscription: plan, how they pay, their deal and what they still owe. */
export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireAdmin('platform.billing.view');
  const params = await searchParams;
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  qs.set('pageSize', String(await resolvePageSize(params.pageSize)));
  const [data, plans] = await Promise.all([
    serverFetch<{ subscriptions: PlatformSubscription[]; pagination: PaginationInfo }>(`/admin/farms/subscriptions?${qs}`),
    getAdminPlans(),
  ]);
  const rows = data?.subscriptions ?? [];

  // Search / filters in use: chips above the table and on the download header.
  const criteria = urlCriteria('/admin/subscriptions', params, [
    ['Search', `“${params.q}”`, 'q'],
    ['Plan', plans.find((p) => p.id === params.plan)?.name ?? params.plan, 'plan'],
    ['State', STATE_LABEL[params.state ?? ''] ?? params.state, 'state'],
    ['Billing', SOURCE_LABEL[params.source ?? ''] ?? params.source, 'source'],
    ['Invoices', BILLING_LABEL[params.billing ?? ''] ?? params.billing, 'billing'],
  ]);

  return (
    <div className="space-y-4">
      <TableFrame
        criteria={
          <CriteriaBar
            total={data?.pagination.total ?? 0}
            {...criteria}
          />
        }
        toolbar={
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex flex-1 flex-wrap gap-2" action="/admin/subscriptions">
          {params.pageSize && <input type="hidden" name="pageSize" value={params.pageSize} />}
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={params.q} placeholder="Search tenant or owner email…" className="h-8 pl-9 text-xs" />
          </div>
          <FilterToggle active={[params.plan, params.state, params.source, params.billing].filter(Boolean).length}>
          <Select className="h-8 text-xs" name="plan" defaultValue={params.plan ?? ''} aria-label="Plan">
            <option value="">All plans</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select className="h-8 text-xs" name="state" defaultValue={params.state ?? ''} aria-label="State">
            <option value="">Any state</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past due</option>
            <option value="free">Free</option>
            <option value="canceled">Canceled</option>
          </Select>
          <Select className="h-8 text-xs" name="source" defaultValue={params.source ?? ''} aria-label="Billing source">
            <option value="">Any billing</option>
            <option value="manual">Manual (invoice)</option>
            <option value="stripe">Stripe (card)</option>
            <option value="none">Not paying</option>
          </Select>
          <Select className="h-8 text-xs" name="billing" defaultValue={params.billing ?? ''} aria-label="Unpaid invoices">
            <option value="">Any balance</option>
            <option value="unpaid">Has unpaid invoices</option>
            <option value="overdue">Has overdue invoices</option>
          </Select>
          </FilterToggle>
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
        </form>
        <div className="flex items-center gap-2">
          <PageSizeSelect />
          <SubscriptionsExport query={qs.toString()} criteria={exportCriteria(criteria.items)} />
          {me.platformPermissions?.includes('platform.billing.manage') && <RecordPaymentButton plans={plans} />}
        </div>
      </div>
        }
      >
      {rows.length === 0 ? (
        <EmptyState className="m-4" icon={CreditCard} title="No subscriptions found" description="Try a different search or filter." />
      ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Tenant</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 font-medium">Billing</th>
                <th className="px-5 py-3 font-medium">Renews / ends</th>
                <th className="px-5 py-3 font-medium">Limits</th>
                <th className="px-5 py-3 text-right font-medium">MRR</th>
                <th className="px-5 py-3 font-medium">Unpaid</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const s = r.subscription;
                const ends = s.state === 'trialing' && !s.source ? s.trialEndsAt : s.currentPeriodEnd;
                return (
                  <tr key={r.farm.id} className="hover:bg-muted/30">
                    <td className="px-5 py-3">
                      <Link href={`/admin/farms/${r.farm.id}`} className="font-medium hover:text-primary">
                        {flag(r.farm.country)} {r.farm.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{r.owner?.email ?? 'No owner yet (invited)'}</p>
                      {r.farm.suspended && <Badge variant="destructive">Suspended</Badge>}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{s.planName}</p>
                      <Badge variant={STATE_BADGE[s.state] ?? 'default'}>{s.state.replace('_', ' ')}</Badge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {s.source === 'manual' ? 'Manual invoice' : s.source === 'stripe' ? `Stripe · ${s.interval ?? ''}` : '—'}
                      {s.cancelAtPeriodEnd && <span className="block text-xs text-warning">Cancels at period end</span>}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {ends ? formatDate(ends) : s.source === 'manual' ? 'Open-ended' : '—'}
                      {s.trialDaysLeft !== null && <span className="block text-xs">{s.trialDaysLeft} trial days left</span>}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {r.limits.members ?? '∞'} seats · {r.limits.animals?.toLocaleString() ?? '∞'} animals
                      {r.hasOverrides && (
                        <Badge variant="accent" className="ml-1">
                          Deal
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{r.mrr ? formatMoney(r.mrr, 'USD') : '—'}</td>
                    <td className="px-5 py-3">
                      {r.unpaid.count === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Link href={`/admin/farms/${r.farm.id}`} className="hover:text-primary">
                          {r.unpaid.balances.map((b) => (
                            <span key={b.currency} className="block font-medium tabular-nums">
                              {formatMoney(b.amount, b.currency)}
                            </span>
                          ))}
                          <span className={r.unpaid.overdue ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                            {r.unpaid.count} invoice{r.unpaid.count === 1 ? '' : 's'}
                            {r.unpaid.overdue > 0 && ` · ${r.unpaid.overdue} overdue`}
                          </span>
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
      )}
      </TableFrame>
      {data && (
        <Pagination
          pagination={data.pagination}
          basePath="/admin/subscriptions"
          params={{ q: params.q, plan: params.plan, state: params.state, source: params.source, billing: params.billing, pageSize: params.pageSize }}
        />
      )}
    </div>
  );
}
