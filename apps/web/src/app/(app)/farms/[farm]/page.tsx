import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Circle, Clock, Crown, History, MapPin, Settings, UserPlus, Users } from 'lucide-react';
import { FARM_TYPE_INFO, ROLE_INFO, type FarmActivityEntry, type FarmMember, type Permission } from '@kit/shared';
import { PageHeader } from '@/components/app/page-header';
import { Avatar } from '@/components/app/user-menu';
import { FARM_TYPE_ICONS } from '@/modules/farms/constants';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { buttonClasses } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getFarmContext } from '@/modules/farms/server';
import { ACTIVITY_LABELS, BUSINESS_MODULES, OPERATION_MODULES } from '@/modules/farms/navigation';
import { countryName, flag, formatNumber, timeAgo, tzOffset } from '@/lib/format';
import { requireUser, serverFetch } from '@/lib/session';
import { cn } from '@/lib/utils';

type Props = { params: Promise<{ farm: string }>; searchParams: Promise<{ welcome?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { farm } = await params;
  return { title: (await getFarmContext(farm)).farm.name };
}

function greeting(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat('en', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date()));
  return hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export default async function FarmOverviewPage({ params, searchParams }: Props) {
  const { farm: slug } = await params;
  const { welcome } = await searchParams;
  const [user, ctx] = await Promise.all([requireUser(), getFarmContext(slug)]);
  const { farm, membership, subscription, usage, limits } = ctx;
  const can = (p: Permission) => membership.permissions.includes(p);
  const base = `/farms/${farm.slug}`;

  const [members, activity] = await Promise.all([
    can('members.view') ? serverFetch<{ members: FarmMember[] }>(`/farms/${farm.slug}/members`) : null,
    can('activity.view') ? serverFetch<{ entries: FarmActivityEntry[] }>(`/farms/${farm.slug}/activity?pageSize=6`) : null,
  ]);

  const TypeIcon = FARM_TYPE_ICONS[farm.type];
  const localTime = new Intl.DateTimeFormat(farm.locale, { timeStyle: 'short', timeZone: farm.timezone }).format(new Date());
  const profileComplete = Boolean(farm.address || farm.registrationNumber || farm.phone);
  const checklist = [
    { done: true, label: 'Create your farm workspace' },
    { done: profileComplete, label: 'Add address, phone and registration number', href: `${base}/settings`, show: can('farm.update') },
    { done: usage.members > 1, label: 'Invite your team', href: `${base}/team`, show: can('members.invite') },
    { done: subscription.source !== null, label: 'Choose the right plan', href: `${base}/billing`, show: can('billing.manage') },
    { done: false, label: 'Add your first animals (Herd module, coming next)', href: `${base}/herd` },
  ].filter((i) => i.show !== false);
  const progress = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);
  const showSetup = welcome === '1' || progress < 100;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {[farm.city, farm.region, countryName(farm.country)].filter(Boolean).join(', ')} {flag(farm.country)}
          </span>
        }
        title={`${greeting(farm.timezone)}, ${user.name.split(' ')[0]}`}
        description={`Here's the latest at ${farm.name}.`}
        actions={
          <>
            {can('farm.update') && (
              <Link href={`${base}/settings`} className={buttonClasses('outline', 'md')}>
                <Settings className="h-4 w-4" /> Settings
              </Link>
            )}
            {can('members.invite') && (
              <Link href={`${base}/team?invite=1`} className={buttonClasses('primary', 'md')}>
                <UserPlus className="h-4 w-4" /> Invite team
              </Link>
            )}
          </>
        }
      />

      {showSetup && (
        <section className="relative mb-8 overflow-hidden rounded-2xl border bg-gradient-to-br from-emerald-800 via-green-800 to-teal-900 p-6 text-white shadow-lg sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-300/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-lime-300/15 blur-3xl" />
          <div className="relative grid gap-8 md:grid-cols-[1fr_20rem]">
            <div>
              <p className="text-sm font-medium text-lime-200">{welcome === '1' ? 'Your farm is ready 🎉' : 'Finish setting up'}</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight">Get {farm.name} running in a few steps</h2>
              <p className="mt-2 max-w-lg text-sm text-white/75">
                Complete your profile, bring in your team, and you&apos;ll be ready for the herd register when it lands.
              </p>
              <div className="mt-6 max-w-sm">
                <div className="flex justify-between text-xs text-white/70">
                  <span>Setup progress</span>
                  <span className="font-semibold text-white">{progress}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-gradient-to-r from-lime-300 to-amber-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
            <ul className="space-y-2.5">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-start gap-3 text-sm">
                  {item.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-lime-300" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />}
                  {item.href && !item.done ? (
                    <Link href={item.href} className="text-white hover:underline">
                      {item.label}
                    </Link>
                  ) : (
                    <span className={item.done ? 'text-white/60 line-through' : ''}>{item.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TypeIcon}
          label="Herd size"
          value={farm.herdSize ? formatNumber(farm.herdSize, farm.locale) : '—'}
          hint={`${FARM_TYPE_INFO[farm.type].label} · estimate from setup`}
        />
        <StatCard
          icon={Users}
          label="Team"
          tone="blue"
          value={usage.members}
          hint={limits.members === null ? 'Unlimited seats' : `${Math.max(0, limits.members - usage.members)} of ${limits.members} seats free`}
        />
        <StatCard
          icon={Crown}
          label="Plan"
          tone="amber"
          value={subscription.planName}
          hint={
            subscription.state === 'trialing' && subscription.trialDaysLeft !== null
              ? `Trial · ${subscription.trialDaysLeft} days left`
              : subscription.state === 'past_due'
                ? 'Payment past due'
                : subscription.source === 'manual'
                  ? 'Invoiced plan'
                  : subscription.planId === 'free'
                    ? 'Free forever'
                    : 'Active subscription'
          }
        />
        <StatCard icon={Clock} label="Farm time" tone="blue" value={localTime} hint={`${farm.timezone.replace(/_/g, ' ')} · ${tzOffset(farm.timezone)}`} />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_22rem]">
        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Farm toolkit</h2>
              <p className="text-sm text-muted-foreground">Operations modules roll out next — here&apos;s what&apos;s coming to your workspace.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[...OPERATION_MODULES, ...BUSINESS_MODULES].map((m, i) => {
              const Icon = m.icon;
              const included = !m.capability || ctx.capabilities.includes(m.capability);
              return (
                <Link
                  key={m.slug}
                  href={`${base}/${m.slug}`}
                  className="group animate-fade-up rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="flex items-start justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    {m.status === 'soon' ? <Badge variant="accent">Coming soon</Badge> : <Badge variant="success">Live</Badge>}
                  </div>
                  <h3 className="mt-4 font-semibold">{m.label}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{m.summary}</p>
                  {!included && <p className="mt-3 text-xs font-medium text-amber-700 dark:text-accent">Requires an upgrade</p>}
                </Link>
              );
            })}
          </div>
        </section>

        <aside className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">Team</CardTitle>
                <CardDescription>
                  {members?.members.length ?? 0} {members?.members.length === 1 ? 'person' : 'people'}
                </CardDescription>
              </div>
              <Link href={`${base}/team`} className="text-sm font-medium text-primary hover:underline">
                Manage
              </Link>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {(members?.members ?? []).slice(0, 6).map((m) => (
                  <li key={m.userId} className="flex items-center gap-3">
                    <Avatar user={m} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {m.name}
                        {m.userId === user.id && <span className="text-muted-foreground"> (you)</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{m.title || ROLE_INFO[m.role].label}</p>
                    </div>
                    <Badge variant={m.role === 'owner' ? 'primary' : 'default'}>{ROLE_INFO[m.role].label}</Badge>
                  </li>
                ))}
              </ul>
              {can('members.invite') && (
                <Link href={`${base}/team?invite=1`} className={cn(buttonClasses('outline', 'sm'), 'mt-4 w-full')}>
                  <UserPlus className="h-4 w-4" /> Invite someone
                </Link>
              )}
            </CardContent>
          </Card>

          {activity && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base">Recent activity</CardTitle>
                <Link href={`${base}/activity`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  All <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </CardHeader>
              <CardContent>
                {activity.entries.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <History className="h-4 w-4" /> Nothing yet.
                  </p>
                ) : (
                  <ol className="relative space-y-4 border-l pl-5">
                    {activity.entries.map((e) => (
                      <li key={e.id} className="relative text-sm">
                        <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-primary ring-4 ring-card" />
                        <p>
                          <span className="font-medium">{e.actor?.name ?? 'Someone'}</span>{' '}
                          <span className="text-muted-foreground">{ACTIVITY_LABELS[e.action] ?? e.action}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{timeAgo(e.createdAt)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
