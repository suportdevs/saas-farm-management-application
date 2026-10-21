import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, Tractor } from 'lucide-react';
import { FARM_TYPE_INFO, PLAN_LIST, type Pagination as PaginationInfo, type PlatformFarm } from '@kit/shared';
import { TenantsExport } from '@/components/admin/list-exports';
import { NewTenantButton } from '@/components/admin/new-tenant-dialog';
import { Pagination } from '@/components/app/pagination';
import { SubscriptionBadge } from '@/modules/platform/components/subscription-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { countryName, flag, formatDate } from '@/lib/format';
import { requireAdmin, serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'Tenants · Admin' };

type Search = { q?: string; plan?: string; status?: string; country?: string; page?: string };

export default async function AdminFarmsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireAdmin('platform.tenants.view');
  const params = await searchParams;
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const data = await serverFetch<{ farms: PlatformFarm[]; pagination: PaginationInfo }>(`/admin/farms?${qs}`);
  const farms = data?.farms ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
      <form className="flex flex-1 flex-wrap gap-2" action="/admin/farms">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={params.q} placeholder="Search farm, town or owner email…" className="pl-9" />
        </div>
        <Select name="plan" defaultValue={params.plan ?? ''} aria-label="Plan">
          <option value="">All plans</option>
          {PLAN_LIST.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={params.status ?? ''} aria-label="Status">
          <option value="">Any status</option>
          <option value="paying">Paying</option>
          <option value="trialing">On trial</option>
          <option value="free">Free</option>
          <option value="past_due">Past due</option>
          <option value="suspended">Suspended</option>
        </Select>
        {params.country && <input type="hidden" name="country" value={params.country} />}
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
        <div className="flex gap-2">
          <TenantsExport query={qs.toString()} />
          {me.platformPermissions?.includes('platform.tenants.create') && <NewTenantButton />}
        </div>
      </div>

      {farms.length === 0 ? (
        <EmptyState icon={Tractor} title="No tenants found" description="Try a different search or filter." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Tenant</th>
                <th className="px-5 py-3 font-medium">Owner</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 text-right font-medium">Team</th>
                <th className="px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {farms.map((f) => (
                <tr key={f.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3">
                    <Link href={`/admin/farms/${f.id}`} className="font-medium hover:text-primary">
                      {f.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {flag(f.country)} {[f.city, countryName(f.country)].filter(Boolean).join(', ')} · {FARM_TYPE_INFO[f.type].label}
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    {f.owner ? (
                      <Link href={`/admin/users/${f.owner.id}`} className="hover:text-primary">
                        {f.owner.name}
                        <span className="block text-xs text-muted-foreground">{f.owner.email}</span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <SubscriptionBadge farm={f} />
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{f.memberCount}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(f.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {data && <Pagination pagination={data.pagination} basePath="/admin/farms" params={{ q: params.q, plan: params.plan, status: params.status, country: params.country }} />}
    </div>
  );
}
