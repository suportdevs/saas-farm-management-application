import type { Metadata } from 'next';
import Link from 'next/link';
import { CreditCard, Search } from 'lucide-react';
import { PLAN_LIST, type Pagination as PaginationInfo, type PlatformSubscription } from '@kit/shared';
import { SubscriptionsExport } from '@/components/admin/list-exports';
import { Pagination } from '@/components/app/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { flag, formatDate, formatMoney } from '@/lib/format';
import { requireAdmin, serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'Subscriptions · Admin' };

type Search = { q?: string; plan?: string; state?: string; source?: string; billing?: string; page?: string };

const STATE_BADGE: Record<string, 'success' | 'info' | 'warning' | 'default' | 'destructive'> = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  free: 'default',
  canceled: 'destructive',
};

/** Every tenant's subscription: plan, how they pay, their deal and what they still owe. */
export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin('platform.billing.view');
  const params = await searchParams;
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const data = await serverFetch<{ subscriptions: PlatformSubscription[]; pagination: PaginationInfo }>(`/admin/farms/subscriptions?${qs}`);
  const rows = data?.subscriptions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <form className="flex flex-1 flex-wrap gap-2" action="/admin/subscriptions">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={params.q} placeholder="Search tenant or owner email…" className="pl-9" />
          </div>
          <Select name="plan" defaultValue={params.plan ?? ''} aria-label="Plan">
            <option value="">All plans</option>
            {PLAN_LIST.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select name="state" defaultValue={params.state ?? ''} aria-label="State">
            <option value="">Any state</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past due</option>
            <option value="free">Free</option>
            <option value="canceled">Canceled</option>
          </Select>
          <Select name="source" defaultValue={params.source ?? ''} aria-label="Billing source">
            <option value="">Any billing</option>
            <option value="manual">Manual (invoice)</option>
            <option value="stripe">Stripe (card)</option>
            <option value="none">Not paying</option>
          </Select>
          <Select name="billing" defaultValue={params.billing ?? ''} aria-label="Unpaid invoices">
            <option value="">Any balance</option>
            <option value="unpaid">Has unpaid invoices</option>
            <option value="overdue">Has overdue invoices</option>
          </Select>
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>
        <SubscriptionsExport query={qs.toString()} />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={CreditCard} title="No subscriptions found" description="Try a different search or filter." />
      ) : (
        <Card className="overflow-x-auto">
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
        </Card>
      )}
      {data && (
        <Pagination
          pagination={data.pagination}
          basePath="/admin/subscriptions"
          params={{ q: params.q, plan: params.plan, state: params.state, source: params.source, billing: params.billing }}
        />
      )}
    </div>
  );
}
