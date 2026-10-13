import type { Metadata } from 'next';
import { Alert } from '@/components/ui/alert';
import { getSession, serverFetch } from '@/lib/session';
import { PricingTable } from '@/modules/billing/pricing-table';
import type { PlansResponse } from '@/modules/billing/types';

export const metadata: Metadata = { title: 'Pricing', description: 'Simple, transparent pricing. Start free, upgrade when you grow.' };

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [{ user }, data, { checkout }] = await Promise.all([getSession(), serverFetch<PlansResponse>('/billing/plans'), searchParams]);
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">Simple, transparent pricing</h1>
        <p className="mt-4 text-lg text-muted-foreground">Start free. Upgrade when you need more. Cancel any time.</p>
      </div>
      {checkout === 'cancelled' && (
        <Alert variant="info" className="mx-auto mt-8 max-w-xl">
          Checkout was cancelled — you have not been charged.
        </Alert>
      )}
      <div className="mt-12">
        {data ? (
          <PricingTable
            plans={data.plans}
            enabled={data.enabled}
            signedIn={Boolean(user)}
            currentPlanId={typeof user?.plan === 'string' ? user.plan : undefined}
          />
        ) : (
          <Alert variant="error">Pricing is unavailable right now. Please try again later.</Alert>
        )}
      </div>
    </div>
  );
}
