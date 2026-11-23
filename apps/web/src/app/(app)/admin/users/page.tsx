import type { Metadata } from 'next';
import Link from 'next/link';
import type { AdminUser, Pagination as PaginationInfo } from '@kit/shared';
import { UsersExport } from '@/components/admin/list-exports';
import { Pagination } from '@/components/app/pagination';
import { FilterToggle } from '@/components/app/filter-toggle';
import { PageSizeSelect } from '@/components/app/page-size-select';
import { CriteriaBar, exportCriteria, urlCriteria } from '@/components/app/criteria-bar';
import { TableFrame } from '@/components/app/table-frame';
import { resolvePageSize } from '@/lib/page-size';
import { UserStatus } from '@/components/admin/user-status';
import { Avatar } from '@/components/app/user-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { requireAdmin, serverFetch } from '@/lib/session';
import { NewClientAccountButton } from '@/modules/platform/components/new-client-account';

export const metadata: Metadata = { title: 'Users' };

interface UsersResponse {
  users: AdminUser[];
  pagination: PaginationInfo;
}

type Search = { q?: string; page?: string; pageSize?: string; role?: string; status?: string };

/** Labels for the criteria bar. */
const ROLE_LABEL: Record<string, string> = { user: 'Members', admin: 'Admins' };
const STATUS_LABEL: Record<string, string> = { active: 'Active', unverified: 'Unverified', banned: 'Suspended' };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireAdmin('platform.users.view');
  const { q = '', page = '1', role = '', status = '', pageSize = '' } = await searchParams;
  const filters = { q, role, status, pageSize };
  const qs = new URLSearchParams({ page });
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
  qs.set('pageSize', String(await resolvePageSize(pageSize)));
  const data = await serverFetch<UsersResponse>(`/admin/users?${qs}`);
  if (!data) throw new Error('Failed to load users');
  const { users, pagination } = data;

  // Search / filters in use: chips above the table and on the download header.
  const criteria = urlCriteria('/admin/users', filters, [
    ['Search', `“${q}”`, 'q'],
    ['Role', ROLE_LABEL[role] ?? role, 'role'],
    ['Status', STATUS_LABEL[status] ?? status, 'status'],
  ]);

  return (
    <>
      <TableFrame
        criteria={
          <CriteriaBar
            total={pagination.total}
            {...criteria}
          />
        }
        toolbar={
      <>
      <form className="flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={q} placeholder="Search by name or email…" className="h-8 max-w-xs text-xs" />
        <FilterToggle active={[role, status].filter(Boolean).length}>
        <Select className="h-8 text-xs" name="role" defaultValue={role} aria-label="Role">
          <option value="">All roles</option>
          <option value="user">Members</option>
          <option value="admin">Admins</option>
        </Select>
        <Select className="h-8 text-xs" name="status" defaultValue={status} aria-label="Status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="unverified">Unverified</option>
          <option value="banned">Suspended</option>
        </Select>
        </FilterToggle>
        {pageSize && <input type="hidden" name="pageSize" value={pageSize} />}
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
        <PageSizeSelect />
        <UsersExport query={qs.toString()} criteria={exportCriteria(criteria.items)} />
        {me.platformPermissions?.includes('platform.tenants.create') && (
          <div className="ml-auto">
            <NewClientAccountButton />
          </div>
        )}
      </form>
      <p className="mt-2 text-xs text-muted-foreground">{pagination.total.toLocaleString()} users</p>
      </>
        }
      >

        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last sign-in</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3">
                    <Avatar user={u} />
                    <div>
                      <p className="font-medium hover:underline">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={u.role === 'admin' ? 'primary' : 'default'}>{u.staffRoleName ?? u.role}</Badge>
                </td>
                <td className="px-4 py-3">
                  <UserStatus user={u} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableFrame>
      <Pagination pagination={pagination} basePath="/admin/users" params={filters} />
    </>
  );
}
