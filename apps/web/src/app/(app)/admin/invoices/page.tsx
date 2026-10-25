import type { Metadata } from 'next';
import Link from 'next/link';
import { Receipt, Search } from 'lucide-react';
import { PAYMENT_METHOD_LABELS, planName, type ManualInvoice, type Pagination as PaginationInfo } from '@kit/shared';
import { InvoicesExport } from '@/components/admin/list-exports';
import { Pagination } from '@/components/app/pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatDate, formatMoney } from '@/lib/format';
import { requireAdmin, serverFetch } from '@/lib/session';
import { getAdminPlans } from '@/modules/subscriptions/server';
import { InvoiceStatusBadge } from '@/modules/platform/components/invoice-status-badge';

export const metadata: Metadata = { title: 'Invoices · Admin' };

type Search = { q?: string; status?: string; page?: string };

/** Every manual invoice across tenants. Issue and settle them on the tenant's page. */
export default async function AdminInvoicesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin('platform.billing.view');
  const params = await searchParams;
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const [data, plans] = await Promise.all([
    serverFetch<{ invoices: ManualInvoice[]; pagination: PaginationInfo }>(`/admin/farms/invoices?${qs}`),
    getAdminPlans(),
  ]);
  const invoices = data?.invoices ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <form className="flex flex-1 flex-wrap gap-2" action="/admin/invoices">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={params.q} placeholder="Invoice number, description or tenant…" className="pl-9" />
          </div>
          <Select name="status" defaultValue={params.status ?? ''} aria-label="Status">
            <option value="">Any status</option>
            <option value="open">Open</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </Select>
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>
        <InvoicesExport query={qs.toString()} plans={plans} />
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices found"
          description="Manual invoices are issued from a tenant's page (Tenants → a tenant → Manual invoices)."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Invoice</th>
                <th className="px-5 py-3 font-medium">Tenant</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Due</th>
                <th className="px-5 py-3 text-right font-medium">Amount</th>
                <th className="px-5 py-3 text-right font-medium">Balance</th>
                <th className="px-5 py-3 font-medium">Payments</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.map((i) => (
                <tr key={i.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3">
                    <p className="font-medium">{i.number}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.description}
                      {i.planId && i.periodEnd && ` · ${planName(plans, i.planId)} through ${formatDate(i.periodEnd)}`}
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/admin/farms/${i.farm.id}`} className="hover:text-primary">
                      {i.farm.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <InvoiceStatusBadge status={i.status} />
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(i.dueAt)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatMoney(i.amount, i.currency)}</td>
                  <td className="px-5 py-3 text-right font-medium tabular-nums">{i.balance ? formatMoney(i.balance, i.currency) : '—'}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {i.payments.length === 0
                      ? '—'
                      : i.payments.map((p) => (
                          <span key={p.id} className="block">
                            {formatMoney(p.amount, i.currency)} · {PAYMENT_METHOD_LABELS[p.method]} · {formatDate(p.paidAt)}
                          </span>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {data && <Pagination pagination={data.pagination} basePath="/admin/invoices" params={{ q: params.q, status: params.status }} />}
    </div>
  );
}
