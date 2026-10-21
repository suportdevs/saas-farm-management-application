import type { Metadata } from 'next';
import Link from 'next/link';
import { FARM_TYPE_INFO, PLANS, type AdminStats, type PlatformStats } from '@kit/shared';
import { SignupsChart } from '@/components/admin/signups-chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { countryName, flag, formatMoney } from '@/lib/format';
import { requireAdmin, serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'Admin' };

export default async function AdminOverviewPage() {
  await requireAdmin('platform.stats.view');
  const [stats, platform] = await Promise.all([serverFetch<AdminStats>('/admin/stats'), serverFetch<PlatformStats>('/admin/farms/stats')]);
  if (!stats || !platform) throw new Error('Failed to load stats');
  const { users, signups, jobs } = stats;
  const { farms } = platform;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Monthly recurring revenue" value={formatMoney(platform.mrr, 'USD', 'en-US')} hint={`ARR ${formatMoney(platform.mrr * 12, 'USD', 'en-US', { compact: true })}`} />
        <Stat label="Farms" value={farms.total.toLocaleString()} hint={`+${farms.new7d} this week · +${farms.new30d} in 30 days`} href="/admin/farms" />
        <Stat
          label="Paying farms"
          value={farms.paying.toLocaleString()}
          hint={farms.pastDue ? `${farms.pastDue} past due` : farms.total ? `${Math.round((farms.paying / farms.total) * 100)}% of farms` : '—'}
          href="/admin/farms?status=paying"
        />
        <Stat label="On trial" value={farms.trialing.toLocaleString()} hint={`${farms.suspended} suspended`} href="/admin/farms?status=trialing" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>New farms</CardTitle>
            <CardDescription>{farms.new30d} farms created in the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <SignupsChart data={platform.created} noun="farm" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Farms by plan</CardTitle>
            <CardDescription>Plan in effect (trials count as Starter)</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList rows={platform.byPlan.map((r) => ({ key: r.planId, label: PLANS[r.planId].name, count: r.count, href: `/admin/farms?plan=${r.planId}` }))} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top countries</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              rows={platform.byCountry.map((r) => ({ key: r.country, label: `${flag(r.country)} ${countryName(r.country)}`, count: r.count, href: `/admin/farms?country=${r.country}` }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Operation types</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={platform.byType.map((r) => ({ key: r.type, label: FARM_TYPE_INFO[r.type].label, count: r.count }))} />
          </CardContent>
        </Card>
      </div>

      <h2 className="pt-4 text-lg font-semibold tracking-tight">Users</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total users" value={users.total.toLocaleString()} hint={`+${users.new7d} in the last 7 days`} href="/admin/users" />
        <Stat label="Active users (7d)" value={users.activeUsers7d.toLocaleString()} hint={`${users.activeSessions} active sessions`} />
        <Stat
          label="Verified"
          value={users.verified.toLocaleString()}
          hint={users.total ? `${Math.round((users.verified / users.total) * 100)}% of users` : '—'}
          href="/admin/users?status=unverified"
        />
        <Stat label="Suspended" value={users.banned.toLocaleString()} hint={`${users.admins} admin${users.admins === 1 ? '' : 's'}`} href="/admin/users?status=banned" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sign-ups</CardTitle>
            <CardDescription>{users.new30d} new users in the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <SignupsChart data={signups} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Background jobs</CardTitle>
            <CardDescription>
              {jobs.pending} pending · {jobs.failed} failed
              {jobs.failed > 0 && ' — check the API logs for the failure reason.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, href }: { label: string; value: string; hint: string; href?: string }) {
  const body = (
    <Card className="h-full p-5 transition-colors hover:border-primary/40">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** Horizontal magnitude bars in a single hue; labels and values stay in text ink. */
function BarList({ rows }: { rows: { key: string; label: string; count: number; href?: string }[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No farms yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const row = (
          <div className="group" title={`${r.label}: ${r.count} (${Math.round((r.count / total) * 100)}%)`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{r.label}</span>
              <span className="tabular-nums text-muted-foreground">{r.count.toLocaleString()}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted">
              <div className="h-full rounded-[4px] bg-primary transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }} />
            </div>
          </div>
        );
        return <li key={r.key}>{r.href ? <Link href={r.href}>{row}</Link> : row}</li>;
      })}
    </ul>
  );
}
