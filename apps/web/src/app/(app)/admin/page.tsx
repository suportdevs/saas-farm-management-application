import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  BadgeCheck,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Hourglass,
  Layers,
  MailCheck,
  Receipt,
  Tractor,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { FARM_TYPE_INFO, planName, type AdminStats, type AuditLogEntry, type Pagination, type PlatformInfo, type PlatformPermission, type PlatformStats } from '@kit/shared';
import { SignupsChart } from '@/components/admin/signups-chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { actionLabel } from '@/lib/audit';
import { countryName, flag, formatDate, formatMoney, timeAgo } from '@/lib/format';
import { requireAdmin, serverFetch } from '@/lib/session';
import { cn } from '@/lib/utils';
import { RecordPaymentButton } from '@/modules/platform/components/manual-payment-dialog';
import { NewTenantButton } from '@/modules/platform/components/new-tenant-dialog';
import { getAdminPlans } from '@/modules/subscriptions/server';

export const metadata: Metadata = { title: 'Admin' };

export default async function AdminOverviewPage() {
  const me = await requireAdmin('platform.stats.view');
  const can = (p: PlatformPermission) => Boolean(me.platformPermissions?.includes(p));
  const [stats, platform, plans, system, overdue, audit] = await Promise.all([
    serverFetch<AdminStats>('/admin/stats'),
    serverFetch<PlatformStats>('/admin/farms/stats'),
    getAdminPlans(),
    serverFetch<PlatformInfo>('/admin/system'),
    // Only the count is needed, so ask for a single row.
    can('platform.billing.view') ? serverFetch<{ pagination: Pagination }>('/admin/farms/invoices?status=overdue&pageSize=1') : null,
    can('platform.audit.view') ? serverFetch<{ events: AuditLogEntry[] }>('/admin/audit-logs?pageSize=8') : null,
  ]);
  if (!stats || !platform) throw new Error('Failed to load stats');
  const { users, signups, jobs } = stats;
  const { farms } = platform;

  // Things an operator should look at today; only the ones that apply are shown.
  const alerts: Alert[] = [
    farms.pastDue > 0 && { tone: 'danger', title: `${farms.pastDue} tenant${s(farms.pastDue)} with payment due`, detail: 'Stripe could not collect the last payment.', href: '/admin/farms?status=past_due' },
    (overdue?.pagination.total ?? 0) > 0 && {
      tone: 'danger',
      title: `${overdue!.pagination.total} overdue invoice${s(overdue!.pagination.total)}`,
      detail: 'Manual invoices past their due date.',
      href: '/admin/invoices?status=overdue',
    },
    jobs.failed > 0 && { tone: 'danger', title: `${jobs.failed} failed background job${s(jobs.failed)}`, detail: 'Check the API logs for the reason.', href: '/admin/system' },
    system && !system.database.connected && { tone: 'danger', title: 'Database unreachable', detail: 'Check DATABASE_URL and that Postgres is running.', href: '/admin/system' },
    system && system.database.pendingMigrations.length > 0 && {
      tone: 'warning',
      title: `${system.database.pendingMigrations.length} database migration${s(system.database.pendingMigrations.length)} pending`,
      detail: 'Run npm run db:migrate.',
      href: '/admin/system',
    },
    farms.suspended > 0 && { tone: 'warning', title: `${farms.suspended} suspended tenant${s(farms.suspended)}`, detail: 'Their teams cannot use the app.', href: '/admin/farms?status=suspended' },
    system && !system.billing.stripeConfigured && { tone: 'info', title: 'Online payments are off', detail: 'Set the Stripe keys to let farms upgrade themselves.', href: '/admin/system' },
    system && !system.email.smtpConfigured && { tone: 'info', title: 'Email is not configured', detail: 'Invitations and resets are not being delivered.', href: '/admin/system' },
    can('platform.users.view') && users.total - users.verified > 0 && {
      tone: 'info',
      title: `${users.total - users.verified} unverified user${s(users.total - users.verified)}`,
      detail: 'Signed up but have not confirmed their email.',
      href: '/admin/users?status=unverified',
    },
  ].filter((a): a is Alert => Boolean(a));

  const quickActions = [
    can('platform.billing.view') && { label: 'Subscriptions', hint: 'Plans, trials and deals', href: '/admin/subscriptions', icon: Layers },
    can('platform.billing.view') && { label: 'Open invoices', hint: 'Record a payment', href: '/admin/invoices?status=open', icon: Receipt },
    can('platform.billing.view') && { label: 'Plans', hint: 'Prices and limits', href: '/admin/plans', icon: FileText },
    can('platform.users.view') && { label: 'Users', hint: 'Accounts and sessions', href: '/admin/users', icon: Users },
  ].filter((a): a is QuickAction => Boolean(a));

  const urgent = alerts.filter((a) => a.tone !== 'info').length;

  return (
    <div className="space-y-6">
      <section className="hero-surface relative overflow-hidden rounded-3xl p-6 text-white shadow-xl shadow-primary/10 sm:p-8">
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-sm font-medium text-white/70">{formatDate(new Date().toISOString(), { dateStyle: 'full' })}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Welcome back, {me.name.split(' ')[0]}</h1>
            <p className="mt-1.5 max-w-xl text-sm text-white/75 sm:text-base">Here is how the platform is doing today.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 ring-1 ring-white/20 backdrop-blur">
                <span className={cn('h-2 w-2 rounded-full', urgent ? 'bg-amber-300' : 'bg-emerald-300 shadow-[0_0_8px] shadow-emerald-300')} />
                {urgent ? `${urgent} item${s(urgent)} need attention` : 'All systems healthy'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 ring-1 ring-white/20 backdrop-blur">
                <Tractor className="h-3.5 w-3.5" /> +{farms.new7d} farm{s(farms.new7d)} this week
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            <HeroFigure label="MRR" value={formatMoney(platform.mrr, 'USD', 'en-US')} />
            <HeroFigure label="Farms" value={farms.total.toLocaleString()} />
            <HeroFigure label="Users" value={users.total.toLocaleString()} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/subscriptions" className="block">
          <StatCard icon={CircleDollarSign} label="Monthly recurring revenue" value={formatMoney(platform.mrr, 'USD', 'en-US')} hint={`ARR ${formatMoney(platform.mrr * 12, 'USD', 'en-US', { compact: true })}`} />
        </Link>
        <Link href="/admin/farms" className="block">
          <StatCard icon={Tractor} tone="blue" label="Farms" value={farms.total.toLocaleString()} hint={`+${farms.new7d} this week · +${farms.new30d} in 30 days`} />
        </Link>
        <Link href="/admin/farms?status=paying" className="block">
          <StatCard
            icon={BadgeCheck}
            label="Paying farms"
            value={farms.paying.toLocaleString()}
            hint={farms.pastDue ? `${farms.pastDue} past due` : farms.total ? `${Math.round((farms.paying / farms.total) * 100)}% of farms` : '—'}
          />
        </Link>
        <Link href="/admin/farms?status=trialing" className="block">
          <StatCard icon={Hourglass} tone="amber" label="On trial" value={farms.trialing.toLocaleString()} hint={`${farms.suspended} suspended`} />
        </Link>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> Needs attention
            </CardTitle>
            <CardDescription>{alerts.length ? `${alerts.length} item${s(alerts.length)} to review` : 'Nothing needs your attention right now.'}</CardDescription>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-4 text-sm">
                <CheckCircle2 className="h-5 w-5 text-success" /> All clear — payments, jobs and system checks look healthy.
              </div>
            ) : (
              <ul className="divide-y rounded-xl border">
                {alerts.map((a) => (
                  <li key={a.title}>
                    <Link href={a.href} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', TONE_DOT[a.tone])} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{a.title}</span>
                        <span className="block text-xs text-muted-foreground">{a.detail}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Common tasks, one click away.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(can('platform.tenants.create') || can('platform.billing.manage')) && (
              <div className="grid gap-2 sm:grid-cols-2 [&_button]:w-full">
                {can('platform.tenants.create') && <NewTenantButton plans={plans.filter((p) => !p.archived)} />}
                {can('platform.billing.manage') && <RecordPaymentButton plans={plans} variant="outline" />}
              </div>
            )}
            {quickActions.map((a) => (
              <Link key={a.href} href={a.href} className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/40">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-primary">
                  <a.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{a.label}</span>
                  <span className="block text-xs text-muted-foreground">{a.hint}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
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
            <BarList rows={platform.byPlan.map((r) => ({ key: r.planId, label: planName(plans, r.planId), count: r.count, href: `/admin/farms?plan=${r.planId}` }))} />
          </CardContent>
        </Card>
      </div>

      <div className={cn('grid gap-6', audit ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}>
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
        {audit && (
          <Card>
            <CardHeader className="flex items-start justify-between gap-2 space-y-0">
              <div>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>Latest admin and security events</CardDescription>
              </div>
              <Link href="/admin/audit-logs" className="text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {audit.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ol className="relative space-y-4 border-l pl-4">
                  {audit.events.map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                      <p className="text-sm font-medium leading-tight">{actionLabel(e.action)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {e.actor?.email ?? (typeof e.metadata.email === 'string' ? e.metadata.email : 'System')} · {timeAgo(e.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <h2 className="pt-4 text-lg font-semibold tracking-tight">Users</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/users" className="block">
          <StatCard icon={Users} tone="blue" label="Total users" value={users.total.toLocaleString()} hint={`+${users.new7d} in the last 7 days`} />
        </Link>
        <StatCard icon={Activity} label="Active users (7d)" value={users.activeUsers7d.toLocaleString()} hint={`${users.activeSessions} active sessions`} />
        <Link href="/admin/users?status=unverified" className="block">
          <StatCard
            icon={MailCheck}
            label="Verified"
            value={users.verified.toLocaleString()}
            hint={users.total ? `${Math.round((users.verified / users.total) * 100)}% of users` : '—'}
          />
        </Link>
        <Link href="/admin/users?status=banned" className="block">
          <StatCard icon={Ban} tone="rose" label="Suspended" value={users.banned.toLocaleString()} hint={`${users.admins} admin${users.admins === 1 ? '' : 's'}`} />
        </Link>
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

interface Alert {
  tone: 'danger' | 'warning' | 'info';
  title: string;
  detail: string;
  href: string;
}

interface QuickAction {
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
}

const TONE_DOT: Record<Alert['tone'], string> = { danger: 'bg-destructive', warning: 'bg-warning', info: 'bg-info' };

/** A big number on the hero banner, on frosted glass. */
function HeroFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
    </div>
  );
}

/** "s" for plurals: 1 tenant, 2 tenants. */
const s = (n: number) => (n === 1 ? '' : 's');

/** Horizontal magnitude bars in a single hue; labels and values stay in text ink. */
function BarList({ rows }: { rows: { key: string; label: string; count: number; href?: string }[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No farms yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
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
