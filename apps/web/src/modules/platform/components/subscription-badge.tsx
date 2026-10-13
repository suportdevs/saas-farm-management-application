import { Badge } from '@/components/ui/badge';
import type { PlatformFarm } from '@kit/shared';

export function SubscriptionBadge({ farm }: { farm: Pick<PlatformFarm, 'subscription' | 'suspendedAt'> }) {
  const s = farm.subscription;
  if (farm.suspendedAt) return <Badge variant="destructive">Suspended</Badge>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant={s.planId === 'free' ? 'default' : 'primary'}>{s.planName}</Badge>
      {s.state === 'trialing' && !s.source && <Badge variant="info">Trial · {s.trialDaysLeft}d</Badge>}
      {s.state === 'past_due' && <Badge variant="warning">Past due</Badge>}
      {s.source === 'manual' && <Badge variant="outline">Invoiced</Badge>}
    </span>
  );
}
