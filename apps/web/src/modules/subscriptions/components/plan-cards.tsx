'use client';

import type { ReactNode } from 'react';
import { Check, Sparkles } from 'lucide-react';
import type { BillingInterval, PlanDefinition, PlanId } from '@kit/shared';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

export function IntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (v: BillingInterval) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border bg-card p-1 text-sm shadow-sm" role="radiogroup" aria-label="Billing period">
      {(['month', 'year'] as const).map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          onClick={() => onChange(i)}
          className={cn('rounded-full px-4 py-1.5 font-medium transition-colors', value === i ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground')}
        >
          {i === 'month' ? 'Monthly' : 'Yearly'}
          {i === 'year' && <span className={cn('ml-1.5 rounded-full px-1.5 py-px text-[10px] font-bold', value === i ? 'bg-white/20' : 'bg-accent/30 text-amber-800 dark:text-accent')}>Save up to 17%</span>}
        </button>
      ))}
    </div>
  );
}

export function PlanCards({
  plans,
  interval,
  currentPlanId,
  action,
}: {
  plans: Pick<PlanDefinition, 'id' | 'name' | 'tagline' | 'prices' | 'custom' | 'highlighted' | 'features'>[];
  interval: BillingInterval;
  currentPlanId?: PlanId;
  action: (planId: PlanId) => ReactNode;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => {
        const price = plan.prices[interval];
        const monthly = interval === 'year' && price ? Math.round(price / 12) : price;
        const current = plan.id === currentPlanId;
        return (
          <div
            key={plan.id}
            className={cn(
              'relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md',
              plan.highlighted && 'border-primary shadow-lg shadow-primary/10 ring-1 ring-primary',
              current && !plan.highlighted && 'border-primary/50',
            )}
          >
            {plan.highlighted && (
              <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary to-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow">
                <Sparkles className="h-3 w-3" /> Most popular
              </span>
            )}
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              {current && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Current</span>}
            </div>
            <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.tagline}</p>
            <div className="mt-5 flex items-baseline gap-1">
              {plan.custom ? (
                <span className="text-3xl font-bold tracking-tight">Custom</span>
              ) : monthly ? (
                <>
                  <span className="text-4xl font-bold tracking-tight">{formatMoney(monthly, 'USD', 'en-US')}</span>
                  <span className="text-sm text-muted-foreground">/ month</span>
                </>
              ) : (
                <span className="text-4xl font-bold tracking-tight">Free</span>
              )}
            </div>
            <p className="mt-1 h-5 text-xs text-muted-foreground">
              {plan.custom ? 'Volume pricing for groups' : price && interval === 'year' ? `${formatMoney(price, 'USD', 'en-US')} billed yearly` : price ? 'Billed monthly' : 'No card required'}
            </p>
            <div className="mt-5">{action(plan.id)}</div>
            <ul className="mt-6 space-y-2.5 border-t pt-5 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
