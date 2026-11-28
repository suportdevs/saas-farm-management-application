import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Search } from 'lucide-react';
import type { Pagination as PaginationInfo, PlatformOrganization } from '@kit/shared';
import { OrganizationsExport } from '@/components/admin/list-exports';
import { Pagination } from '@/components/app/pagination';
import { PageSizeSelect } from '@/components/app/page-size-select';
import { ColumnToggle } from '@/components/app/column-toggle';
import { CriteriaBar } from '@/components/app/criteria-bar';
import { exportCriteria, urlCriteria } from '@/components/app/criteria';
import { TableFrame } from '@/components/app/table-frame';
import { resolvePageSize } from '@/lib/page-size';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/format';
import { requireAdmin, serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'Clients · Admin' };

/** Client organizations: who they are, who owns them and how many farms they run. */
export default async function AdminOrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; pageSize?: string }> }) {
  await requireAdmin('platform.tenants.view');
  const params = await searchParams;
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  qs.set('pageSize', String(await resolvePageSize(params.pageSize)));
  const data = await serverFetch<{ organizations: PlatformOrganization[]; pagination: PaginationInfo }>(`/admin/organizations?${qs}`);
  const rows = data?.organizations ?? [];

  // Search / filters in use: chips above the table and on the download header.
  const criteria = urlCriteria('/admin/organizations', params, [['Search', `“${params.q}”`, 'q']]);

  return (
    <div className="space-y-4">
      <TableFrame columns="admin-organizations"
        criteria={<CriteriaBar total={data?.pagination.total ?? 0} {...criteria} />}
        toolbar={
      <div className="flex flex-wrap items-center gap-2">
      <form className="flex flex-1 flex-wrap gap-2" action="/admin/organizations">
          {params.pageSize && <input type="hidden" name="pageSize" value={params.pageSize} />}
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={params.q} placeholder="Search organization or owner email…" className="h-8 pl-9 text-xs" />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
      </form>
      <div className="ml-auto flex items-center gap-2">
        <PageSizeSelect />
        <ColumnToggle />
        <OrganizationsExport query={qs.toString()} criteria={exportCriteria(criteria.items)} />
      </div>
      </div>
        }
      >
      {rows.length === 0 ? (
        <EmptyState className="m-4" icon={Building2} title="No clients found" description="Organizations appear when a farm is created." />
      ) : (
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
      )}
      </TableFrame>
      {data && <Pagination pagination={data.pagination} basePath="/admin/organizations" params={{ q: params.q, pageSize: params.pageSize }} />}
    </div>
  );
}
