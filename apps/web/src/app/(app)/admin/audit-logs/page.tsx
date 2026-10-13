import type { Metadata } from 'next';
import Link from 'next/link';
import type { AuditLogEntry, Pagination as PaginationInfo } from '@kit/shared';
import { Pagination } from '@/components/app/pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { actionLabel, describeAgent } from '@/lib/audit';
import { requireAdmin, serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'Audit log' };

type Search = { page?: string; action?: string; userId?: string };

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const { page = '1', action = '', userId = '' } = await searchParams;
  const filters = { action, userId };
  const qs = new URLSearchParams({ page });
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
  const data = await serverFetch<{ events: AuditLogEntry[]; pagination: PaginationInfo }>(`/admin/audit-logs?${qs}`);
  if (!data) throw new Error('Failed to load the audit log');

  return (
    <>
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="action" defaultValue={action} placeholder="Action prefix, e.g. auth. or admin." className="max-w-xs" />
        {userId && <input type="hidden" name="userId" value={userId} />}
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {(action || userId) && (
          <Link href="/admin/audit-logs" className="self-center text-sm text-primary hover:underline">
            Clear filters
          </Link>
        )}
      </form>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.events.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{actionLabel(e.action)}</p>
                  <code className="text-xs text-muted-foreground">{e.action}</code>
                </td>
                <td className="px-4 py-3">
                  {e.actor ? (
                    <Link href={`/admin/users/${e.actor.id}`} className="hover:underline">
                      {e.actor.email}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{typeof e.metadata.email === 'string' ? e.metadata.email : 'Anonymous'}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {e.targetType === 'user' && e.targetId ? (
                    <Link href={`/admin/users/${e.targetId}`} className="text-primary hover:underline">
                      user
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{e.targetType ?? '—'}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {e.ip ?? '—'}
                  <br />
                  {describeAgent(e.userAgent).label}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {data.events.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No events found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <Pagination pagination={data.pagination} basePath="/admin/audit-logs" params={filters} />
    </>
  );
}
