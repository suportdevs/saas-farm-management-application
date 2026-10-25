'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CalendarClock, CreditCard, Download, ExternalLink, Info, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { type BillingInterval, type BillingOverview, type FarmInvoice, type PlanId } from '@kit/shared';
import { PageHeader } from '@/components/app/page-header';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Meter } from '@/components/ui/meter';
import { api, errorMessage } from '@/lib/api';
import { useFarm } from '@/modules/farms/context';
import { formatFarmDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { IntervalToggle, PlanCards } from '@/modules/subscriptions/components/plan-cards';

const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL ?? 'sales@herdsphere.app';
const RANK: Record<PlanId, number> = { free: 0, growth: 1, pro: 2, enterprise: 3 };

const STATE_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  free: { label: 'Free', variant: 'default' },
  trialing: { label: 'Trial', variant: 'info' },
  active: { label: 'Active', variant: 'success' },
  past_due: { label: 'Payment due', variant: 'warning' },
  canceled: { label: 'Cancelled', variant: 'destructive' },
};

export function BillingPanel({ overview, invoices }: { overview: BillingOverview; invoices: FarmInvoice[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const { farm, membership } = useFarm();
  const canManage = membership.permissions.includes('billing.manage');
  const { subscription: sub, usage, limits, plans, enabled } = overview;
  const [interval, setInterval] = useState<BillingInterval>(sub.interval ?? 'year');
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const checkout = params.get('checkout');
    if (checkout === 'success') toast.success('Payment received — your plan will update in a few seconds.');
    if (checkout === 'cancelled') toast.info('Checkout cancelled. No changes were made.');
    if (checkout) {
      router.replace(`/farms/${farm.slug}/billing`);
      if (checkout === 'success') setTimeout(() => router.refresh(), 3000);
    }
  }, [params, router, farm.slug]);

  const go = async (key: string, path: string, body?: object) => {
    setPending(key);
    try {
      const { url } = await api.post<{ url: string }>(path, body);
      window.location.href = url;
    } catch (err) {
      toast.error(errorMessage(err));
      setPending(null);
    }
  };

  const hasPaidStripe = sub.source === 'stripe';
  const status = STATE_BADGE[sub.state] ?? STATE_BADGE.free!;

  const action = (planId: PlanId) => {
    const plan = plans.find((p) => p.id === planId)!;
    if (planId === sub.planId && sub.state !== 'trialing') {
      return (
        <Button variant="outline" className="w-full" disabled>
          Current plan
        </Button>
      );
    }
    if (plan.custom) {
      return (
        <a href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`Enterprise plan for ${farm.name}`)}`} className={cn(buttonClasses('outline'), 'w-full')}>
          Talk to sales
        </a>
      );
    }
    if (planId === 'free') {
      return hasPaidStripe && canManage ? (
        <Button variant="ghost" className="w-full" loading={pending === 'portal-free'} onClick={() => go('portal-free', `/farms/${farm.slug}/billing/portal`)}>
          Downgrade
        </Button>
      ) : (
        <Button variant="ghost" className="w-full" disabled>
          {sub.state === 'trialing' ? 'After your trial' : 'Included'}
        </Button>
      );
    }
    const available = plan.checkout[interval];
    const upgrade = RANK[planId] > RANK[sub.source ? sub.planId : 'free'];
    return (
      <Button
        className="w-full"
        variant={plan.highlighted ? 'primary' : 'outline'}
        disabled={!canManage || !available}
        title={!canManage ? 'Only farm owners can change the plan' : !available ? 'Online checkout is not available yet' : undefined}
        loading={pending === planId}
        onClick={() => go(planId, `/farms/${farm.slug}/billing/checkout`, { planId, interval })}
      >
        {sub.state === 'trialing' && sub.planId === planId && !sub.source ? `Keep ${plan.name}` : upgrade ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
      </Button>
    );
  };

  return (
    <>
      <PageHeader
        title="Plan & billing"
        description={`Each farm has its own subscription. Prices are in USD; taxes are calculated at checkout.`}
        actions={
          hasPaidStripe &&
          canManage && (
            <Button variant="outline" loading={pending === 'portal'} onClick={() => go('portal', `/farms/${farm.slug}/billing/portal`)}>
              <CreditCard className="h-4 w-4" /> Payment methods & invoices <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-2xl">{sub.planName}</CardTitle>
              <Badge variant={status.variant}>{status.label}</Badge>
              {sub.source === 'manual' && <Badge variant="outline">Invoiced</Badge>}
            </div>
            <CardDescription>{plans.find((p) => p.id === sub.planId)?.tagline}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              {sub.state === 'trialing' && sub.trialEndsAt && !sub.source && (
                <Detail icon={CalendarClock} label="Trial ends" value={`${formatFarmDate(sub.trialEndsAt, farm)} · ${sub.trialDaysLeft} days left`} />
              )}
              {sub.source && sub.currentPeriodEnd && (
                <Detail
                  icon={CalendarClock}
                  label={sub.cancelAtPeriodEnd ? 'Ends on' : sub.source === 'manual' ? 'Contract ends' : 'Renews on'}
                  value={formatFarmDate(sub.currentPeriodEnd, farm)}
                />
              )}
              {sub.interval && <Detail icon={Receipt} label="Billing" value={sub.interval === 'year' ? 'Yearly' : 'Monthly'} />}
            </div>
            {sub.cancelAtPeriodEnd && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                Your subscription is set to cancel. The farm moves to the free Starter plan afterwards — nothing is deleted.
              </p>
            )}
            {sub.state === 'trialing' && !sub.source && (
              <p className="text-sm text-muted-foreground">
                You&apos;re trying every {sub.planName} feature for free. Pick a plan below to keep them; otherwise the farm moves to Starter when the trial ends.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Usage</CardTitle>
            <CardDescription>Limits of your current plan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Meter label="Animals" value={usage.animals} max={limits.animals} />
            <Meter label="Team seats" value={usage.members} max={limits.members} />
          </CardContent>
        </Card>
      </div>

      {!enabled && (
        <div className="mt-6 flex gap-3 rounded-xl border border-info/30 bg-info/5 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <p>
            Online checkout isn&apos;t switched on yet. To upgrade now,{' '}
            <a className="font-medium text-primary underline-offset-4 hover:underline" href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`Upgrade ${farm.name}`)}`}>
              contact our team
            </a>{' '}
            and we&apos;ll set up your plan.
          </p>
        </div>
      )}

      <section className="mt-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Plans</h2>
            <p className="text-sm text-muted-foreground">Upgrade, downgrade or cancel at any time.</p>
          </div>
          <IntervalToggle value={interval} onChange={setInterval} />
        </div>
        <PlanCards plans={plans} interval={interval} currentPlanId={sub.planId} action={action} />
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-semibold tracking-tight">Invoices</h2>
        {invoices.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices yet" description="Invoices appear here after your first payment." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Invoice</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-6 py-3 font-medium">{inv.number ?? inv.id}</td>
                    <td className="px-6 py-3 text-muted-foreground">{formatFarmDate(inv.createdAt, farm)}</td>
                    <td className="px-6 py-3 tabular-nums">{formatMoney(inv.total, inv.currency.toUpperCase(), farm.locale)}</td>
                    <td className="px-6 py-3">
                      <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'open' ? 'warning' : 'default'}>{inv.status ?? '—'}</Badge>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {inv.pdfUrl && (
                        <a href={inv.pdfUrl} className="inline-flex items-center gap-1 text-primary hover:underline" target="_blank" rel="noreferrer">
                          <Download className="h-3.5 w-3.5" /> PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof Receipt; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}
