import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Search } from 'lucide-react';
import type { Pagination as PaginationInfo, PlatformOrganization } from '@kit/shared';
import { Pagination } from '@/components/app/pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/format';
import { requireAdmin, serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'Clients · Admin' };

/** Client organizations: who they are, who owns them and how many farms they run. */
export default async function AdminOrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin('platform.tenants.view');
  const params = await searchParams;
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const data = await serverFetch<{ organizations: PlatformOrganization[]; pagination: PaginationInfo }>(`/admin/organizations?${qs}`);
  const rows = data?.organizations ?? [];

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2" action="/admin/organizations">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={params.q} placeholder="Search organization or owner email…" className="pl-9" />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={Building2} title="No clients found" description="Organizations appear when a farm is created." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Organization</th>
                <th className="px-5 py-3 font-medium">Owner</th>
                <th className="px-5 py-3 text-right font-medium">Farms</th>
                <th className="px-5 py-3 text-right font-medium">Members</th>
                <th className="px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3">
                    <Link href={`/admin/farms?organizationId=${o.id}`} className="font-medium hover:text-primary">
                      {o.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    {o.owner ? (
                      <Link href={`/admin/users/${o.owner.id}`} className="hover:text-primary">
                        {o.owner.name}
                        <span className="block text-xs text-muted-foreground">{o.owner.email}</span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Invitation pending</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{o.farmCount}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{o.memberCount}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {data && <Pagination pagination={data.pagination} basePath="/admin/organizations" params={{ q: params.q }} />}
    </div>
  );
}
