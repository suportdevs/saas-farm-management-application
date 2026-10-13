import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { AdminUser, AuditLogEntry } from '@kit/shared';
import { UserActions } from '@/components/admin/user-actions';
import { UserStatus } from '@/components/admin/user-status';
import { Avatar } from '@/components/app/user-menu';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { actionLabel, describeAgent } from '@/lib/audit';
import { requireAdmin, serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'User' };

interface UserDetail {
  user: AdminUser;
  sessions: { id: string; userAgent: string | null; ip: string | null; lastSeenAt: string; impersonated: boolean }[];
}

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const [detail, activity] = await Promise.all([
    serverFetch<UserDetail>(`/admin/users/${id}`),
    serverFetch<{ events: AuditLogEntry[] }>(`/admin/audit-logs?userId=${id}&pageSize=20`),
  ]);
  if (!detail) notFound();
  const { user, sessions } = detail;
  const dt = (v: string | null) => (v ? new Date(v).toLocaleString() : '—');

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All users
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <Avatar user={user} size={48} />
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            {user.name} <Badge variant={user.role === 'admin' ? 'primary' : 'default'}>{user.role}</Badge> <UserStatus user={user} />
          </h2>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {user.bannedAt && (
        <Alert variant="error">
          Suspended on {dt(user.bannedAt)}
          {user.bannedReason && <> — {user.bannedReason}</>}
        </Alert>
      )}

      <Card>
        <CardContent className="grid gap-4 pt-6 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="User ID" value={<code className="break-all text-xs">{user.id}</code>} />
          <Info label="Joined" value={dt(user.createdAt)} />
          <Info label="Last sign-in" value={dt(user.lastLoginAt)} />
          <Info label="Sign-in methods" value={user.hasPassword ? 'Password' : 'Social only'} />
        </CardContent>
      </Card>

      <UserActions user={user} isSelf={user.id === me.id} />

      <Card>
        <CardHeader>
          <CardTitle>Active sessions ({sessions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active sessions.</p>
          ) : (
            <ul className="divide-y text-sm">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                  <span>
                    {describeAgent(s.userAgent).label} {s.impersonated && <Badge>impersonation</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {s.ip ?? 'unknown IP'} · last active {dt(s.lastSeenAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between sm:flex">
          <CardTitle>Recent activity</CardTitle>
          <Link href={`/admin/audit-logs?userId=${user.id}`} className="text-sm text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {!activity?.events.length ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {activity.events.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                  <span>
                    {actionLabel(e.action)}
                    {e.actor && e.actor.id !== user.id && <span className="text-muted-foreground"> by {e.actor.email}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {e.ip ?? '—'} · {dt(e.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
