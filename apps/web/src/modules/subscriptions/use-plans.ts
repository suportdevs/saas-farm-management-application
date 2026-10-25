'use client';

import { useEffect, useState } from 'react';
import type { PublicPlan } from '@kit/shared';
import { api } from '@/lib/api';

let cache: Promise<PublicPlan[]> | null = null;

/** GET /api/billing/plans, fetched once per page load and shared by every caller. */
export function usePlans(): PublicPlan[] {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  useEffect(() => {
    cache ??= api.get<{ plans: PublicPlan[] }>('/billing/plans').then((r) => r.plans, () => []);
    let active = true;
    void cache.then((p) => active && setPlans(p));
    return () => {
      active = false;
    };
  }, []);
  return plans;
}
