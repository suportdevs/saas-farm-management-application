'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PLAN_LIST, type BillingInterval } from '@kit/shared';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IntervalToggle, PlanCards } from '@/modules/subscriptions/components/plan-cards';

const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL ?? 'sales@herdsphere.app';

/** Public pricing: every paid plan starts from a farm's free trial. */
export function PricingTable() {
  const [interval, setInterval] = useState<BillingInterval>('year');
  return (
    <>
      <div className="mb-10 flex justify-center">
        <IntervalToggle value={interval} onChange={setInterval} />
      </div>
      <PlanCards
        plans={PLAN_LIST}
        interval={interval}
        action={(planId) => {
          const plan = PLAN_LIST.find((p) => p.id === planId)!;
          if (plan.custom) {
            return (
              <a href={`mailto:${SALES_EMAIL}?subject=Enterprise%20plan`} className={cn(buttonClasses('outline'), 'w-full')}>
                Talk to sales
              </a>
            );
          }
          return (
            <Link href="/register" className={cn(buttonClasses(plan.highlighted ? 'primary' : 'outline'), 'w-full')}>
              {planId === 'free' ? 'Start for free' : 'Start free trial'}
            </Link>
          );
        }}
      />
      <p className="mt-8 text-center text-sm text-muted-foreground">Prices in USD, per farm. Local taxes may apply.</p>
    </>
  );
}
