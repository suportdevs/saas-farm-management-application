import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  FARM_TYPE_INFO,
  type FarmActivityEntry,
  type FarmInvitation,
  type FarmMember,
  type FarmProfile,
  type ManualInvoice,
  type PlanId,
  type PlanLimits,
  type PlatformFarm,
  type TenantEntitlements,
} from '@kit/shared';
import { FarmAdminActions } from '@/modules/platform/components/farm-admin-actions';
import { TenantBilling } from '@/modules/platform/components/tenant-billing';
import { TenantTeam } from '@/modules/platform/components/tenant-team';
import { SubscriptionBadge } from '@/modules/platform/components/subscription-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ACTIVITY_LABELS } from '@/modules/farms/navigation';
import { countryName, flag, formatDate, timeAgo } from '@/lib/format';
import { requireAdmin, serverFetch } from '@/lib/session';
import { getAdminPlans } from '@/modules/subscriptions/server';

export const metadata: Metadata = { title: 'Farm · Admin' };

interface Detail {
  farm: PlatformFarm;
  profile: FarmProfile;
  billing: { plan: string; status: string | null; source: string | null; stripeCustomerId: string | null; stripeSubscriptionId: string | null };
  members: FarmMember[];
  activity: FarmActivityEntry[];
}

export default async function AdminFarmPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin('platform.tenants.view');
  const { id } = await params;
  const canSeeBilling = me.platformPermissions?.includes('platform.billing.view');
  const [data, deal, invoices, plans, team] = await Promise.all([
    serverFetch<Detail>(`/admin/farms/${id}`),
    serverFetch<{ entitlements: TenantEntitlements; effective: { planId: PlanId; limits: PlanLimits } }>(`/admin/farms/${id}/entitlements`),
    canSeeBilling ? serverFetch<ManualInvoice[]>(`/admin/farms/${id}/invoices`) : null,
    getAdminPlans(),
    serverFetch<{ invitations: FarmInvitation[] }>(`/admin/farms/${id}/team`),
  ]);
  if (!data) notFound();
  const { farm, profile, billing, members, activity } = data;
  const sub = farm.subscription;

  const facts: [string, string][] = [
    ['Type', FARM_TYPE_INFO[profile.type].label],
    ['Location', `${flag(profile.country)} ${[profile.city, profile.region, countryName(profile.country)].filter(Boolean).join(', ')}`],
    ['Time zone', profile.timezone],
    ['Currency / locale', `${profile.currency} · ${profile.locale}`],
    ['Herd size (est.)', profile.herdSize?.toLocaleString() ?? '—'],
    ['Registration no.', profile.registrationNumber ?? '—'],
    ['Created', formatDate(profile.createdAt, { dateStyle: 'medium', timeStyle: 'short' })],
    ['Workspace', `/farms/${profile.slug}`],
  ];
  const billingFacts: [string, string][] = [
    ['Plan in effect', `${sub.planName} (${sub.state})`],
    ['Subscribed plan', billing.plan],
    ['Source', billing.source ?? '—'],
    ['Stripe status', billing.status ?? '—'],
    ['Trial ends', sub.trialEndsAt ? formatDate(sub.trialEndsAt) : '—'],
    ['Period ends', sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : '—'],
    ['Stripe customer', billing.stripeCustomerId ?? '—'],
  ];

  return (
    <div className="space-y-6">
      <Link href="/admin/farms" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All tenants
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{farm.name}</h2>
          <div className="mt-2">
            <SubscriptionBadge farm={farm} />
          </div>
          {farm.suspendedReason && <p className="mt-2 text-sm text-destructive">Suspended: {farm.suspendedReason}</p>}
        </div>
        <FarmAdminActions farm={farm} plans={plans} permissions={me.platformPermissions ?? []} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <Facts rows={facts} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscription</CardTitle>
          </CardHeader>
          <CardContent>
            <Facts rows={billingFacts} />
          </CardContent>
        </Card>
      </div>

      {deal && (
        <TenantBilling
          farmId={farm.id}
          farmName={farm.name}
          currency={profile.currency}
          planId={deal.effective.planId}
          plans={plans}
          entitlements={deal.entitlements}
          invoices={invoices ?? []}
          permissions={me.platformPermissions ?? []}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <TenantTeam
          farmId={farm.id}
          organization={farm.organization}
          members={members}
          invitations={team?.invitations ?? []}
          canManage={Boolean(me.platformPermissions?.includes('platform.tenants.manage'))}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {activity.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span>
                      <span className="font-medium">{e.actor?.name ?? 'System'}</span>{' '}
                      <span className="text-muted-foreground">{ACTIVITY_LABELS[e.action] ?? e.action}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="truncate text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
