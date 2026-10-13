import Link from 'next/link';
import { Ban, Clock, CreditCard } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { getFarmContext } from '@/modules/farms/server';
import { FarmProvider } from '@/modules/farms/context';
import { formatFarmDate } from '@/lib/format';

export default async function FarmLayout({ children, params }: { children: React.ReactNode; params: Promise<{ farm: string }> }) {
  const { farm: slug } = await params;
  const ctx = await getFarmContext(slug);
  const { farm, subscription, membership } = ctx;
  const canBill = membership.permissions.includes('billing.view');

  if (farm.suspendedAt) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <Ban className="h-7 w-7" />
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">{farm.name} is suspended</h1>
        <p className="mt-2 text-muted-foreground">
          Access to this farm was paused by our support team on {formatFarmDate(farm.suspendedAt, farm)}. Your records are safe and nothing has been
          deleted.
        </p>
        {farm.suspendedReason && <p className="mx-auto mt-4 max-w-md rounded-lg border bg-muted/50 px-4 py-3 text-sm">Reason: {farm.suspendedReason}</p>}
        <p className="mt-6 text-sm text-muted-foreground">Contact support to restore access.</p>
      </div>
    );
  }

  return (
    <FarmProvider value={ctx}>
      {subscription.state === 'past_due' && (
        <Banner tone="warning" icon={<CreditCard className="h-4 w-4" />}>
          <span>Your last payment didn&apos;t go through. Update your payment method to keep {subscription.planName} features.</span>
          {canBill && (
            <Link href={`/farms/${farm.slug}/billing`} className={buttonClasses('outline', 'sm')}>
              Fix billing
            </Link>
          )}
        </Banner>
      )}
      {subscription.state === 'trialing' && subscription.source === null && subscription.trialDaysLeft !== null && (
        <Banner tone="primary" icon={<Clock className="h-4 w-4" />}>
          <span>
            <strong className="font-semibold">
              {subscription.trialDaysLeft} day{subscription.trialDaysLeft === 1 ? '' : 's'} left
            </strong>{' '}
            on your free {subscription.planName} trial.
          </span>
          {canBill && (
            <Link href={`/farms/${farm.slug}/billing`} className={buttonClasses('primary', 'sm')}>
              Choose a plan
            </Link>
          )}
        </Banner>
      )}
      {children}
    </FarmProvider>
  );
}

function Banner({ tone, icon, children }: { tone: 'primary' | 'warning'; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = tone === 'warning' ? 'border-warning/40 bg-warning/10' : 'border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-accent/10';
  return (
    <div className={`mb-6 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${cls}`}>
      <span className={tone === 'warning' ? 'text-warning' : 'text-primary'}>{icon}</span>
      <div className="flex flex-1 flex-wrap items-center justify-between gap-3">{children}</div>
    </div>
  );
}
