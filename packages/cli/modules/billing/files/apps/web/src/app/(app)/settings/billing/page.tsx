import type { Metadata } from 'next';
import { requireUser, serverFetch } from '@/lib/session';
import { BillingSettings } from '@/modules/billing/billing-settings';
import { PricingTable } from '@/modules/billing/pricing-table';
import type { PlansResponse, SubscriptionResponse } from '@/modules/billing/types';

export const metadata: Metadata = { title: 'Billing' };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  await requireUser();
  const { checkout } = await searchParams;
  const [plans, subscription] = await Promise.all([
    serverFetch<PlansResponse>('/billing/plans'),
    serverFetch<SubscriptionResponse>('/billing/subscription'),
  ]);
  if (!plans || !subscription) throw new Error('Failed to load billing information');

  return (
    <>
      <BillingSettings data={subscription} checkout={checkout} />
      <PricingTable plans={plans.plans} currentPlanId={subscription.plan.id} signedIn enabled={plans.enabled} />
    </>
  );
}
