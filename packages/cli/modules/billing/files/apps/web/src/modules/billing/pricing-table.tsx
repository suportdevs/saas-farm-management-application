'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatPrice, type BillingInterval, type PublicPlan } from './types';

export function PricingTable({
  plans,
  currentPlanId,
  signedIn,
  enabled,
}: {
  plans: PublicPlan[];
  currentPlanId?: string;
  signedIn: boolean;
  enabled: boolean;
}) {
  const [interval, setInterval] = useState<BillingInterval>('month');
  const [loading, setLoading] = useState<string | null>(null);
  const hasYearly = plans.some((p) => p.prices.year);

  const subscribe = async (planId: string) => {
    setLoading(planId);
    try {
      const { url } = await api.post<{ url: string }>('/billing/checkout', { planId, interval });
      window.location.href = url;
    } catch (err) {
      toast.error(errorMessage(err));
      setLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      {hasYearly && (
        <div className="flex justify-center">
          <div className="inline-flex rounded-lg border bg-card p-1 text-sm" role="radiogroup" aria-label="Billing interval">
            {(['month', 'year'] as const).map((i) => (
              <button
                key={i}
                role="radio"
                aria-checked={interval === i}
                onClick={() => setInterval(i)}
                className={cn('rounded-md px-4 py-1.5 font-medium transition-colors', interval === i ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {i === 'month' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => {
          const price = plan.prices[interval];
          const isCurrent = plan.id === currentPlanId;
          const isFree = Object.keys(plan.prices).length === 0;
          return (
            <div key={plan.id} className={cn('flex flex-col rounded-xl border bg-card p-6 shadow-sm', plan.highlighted && 'border-primary ring-2 ring-primary/20')}>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                {plan.highlighted && <Badge variant="primary">Popular</Badge>}
                {isCurrent && <Badge variant="success">Current plan</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              <p className="mt-6">
                <span className="text-4xl font-bold tabular-nums">{isFree ? formatPrice(0, plan.currency) : price ? formatPrice(price.amount, plan.currency) : '—'}</span>
                {!isFree && price && <span className="text-sm text-muted-foreground">/{interval}</span>}
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                {isFree ? (
                  signedIn ? (
                    <Button variant="outline" className="w-full" disabled>
                      {isCurrent ? 'Your plan' : 'Included'}
                    </Button>
                  ) : (
                    <Link href="/register" className={buttonClasses('outline', 'md', 'w-full')}>
                      Get started
                    </Link>
                  )
                ) : !signedIn ? (
                  <Link href={`/register?next=${encodeURIComponent('/settings/billing')}`} className={buttonClasses(plan.highlighted ? 'primary' : 'outline', 'md', 'w-full')}>
                    Start with {plan.name}
                  </Link>
                ) : (
                  <Button
                    className="w-full"
                    variant={plan.highlighted ? 'primary' : 'outline'}
                    disabled={!enabled || !price?.available || isCurrent}
                    loading={loading === plan.id}
                    onClick={() => subscribe(plan.id)}
                  >
                    {isCurrent ? 'Current plan' : !enabled || !price?.available ? 'Unavailable' : currentPlanId && currentPlanId !== 'free' ? 'Switch plan' : `Upgrade to ${plan.name}`}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
