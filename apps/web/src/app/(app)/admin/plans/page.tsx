import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/session';
import { PlansManager } from '@/modules/platform/components/plans-manager';
import { getAdminPlans } from '@/modules/subscriptions/server';

export const metadata: Metadata = { title: 'Plans · Admin' };

export default async function AdminPlansPage() {
  const me = await requireAdmin('platform.billing.view');
  const plans = await getAdminPlans();
  return <PlansManager plans={plans} canManage={Boolean(me.platformPermissions?.includes('platform.plans.manage'))} />;
}
