import 'server-only';
import { cache } from 'react';
import type { AdminPlan, PublicPlan } from '@kit/shared';
import { serverFetch } from '@/lib/session';

/** Plans customers can see (public, not archived). De-duplicated per request. */
export const getPlans = cache(async (): Promise<PublicPlan[]> => {
  const res = await serverFetch<{ plans: PublicPlan[] }>('/billing/plans');
  return res?.plans ?? [];
});

/** Every plan, archived and hidden ones included — admin pages only. */
export const getAdminPlans = cache(async (): Promise<AdminPlan[]> => {
  const res = await serverFetch<{ plans: AdminPlan[] }>('/admin/plans');
  return res?.plans ?? [];
});
