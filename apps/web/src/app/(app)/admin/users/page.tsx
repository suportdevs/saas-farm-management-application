import type { Metadata } from 'next';
import Link from 'next/link';
import type { AdminUser, Pagination as PaginationInfo } from '@kit/shared';
import { Pagination } from '@/components/app/pagination';
import { UserStatus } from '@/components/admin/user-status';
import { Avatar } from '@/components/app/user-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { requireAdmin, serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'Users' };

interface UsersResponse {
  users: AdminUser[];
  pagination: PaginationInfo;
}

type Search = { q?: string; page?: string; role?: string; status?: string };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const { q = '', page = '1', role = '', status = '' } = await searchParams;
  const filters = { q, role, status };
  const qs = new URLSearchParams({ page });
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
  const data = await serverFetch<UsersResponse>(`/admin/users?${qs}`);
  if (!data) throw new Error('Failed to load users');
  const { users, pagination } = data;

  return (
    <>
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Search by name or email…" className="max-w-xs" />
        <Select name="role" defaultValue={role} aria-label="Role">
          <option value="">All roles</option>
          <option value="user">Members</option>
          <option value="admin">Admins</option>
        </Select>
        <Select name="status" defaultValue={status} aria-label="Status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="unverified">Unverified</option>
          <option value="banned">Suspended</option>
        </Select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      <p className="mb-2 text-sm text-muted-foreground">{pagination.total.toLocaleString()} users</p>
      <Card className="overflow-x-auto">
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
                  <Badge variant={u.role === 'admin' ? 'primary' : 'default'}>{u.role}</Badge>
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
      </Card>
      <Pagination pagination={pagination} basePath="/admin/users" params={filters} />
    </>
  );
}
