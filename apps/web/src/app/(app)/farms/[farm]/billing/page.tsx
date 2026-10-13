import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { BillingOverview, FarmInvoice } from '@kit/shared';
import { BillingPanel } from '@/modules/subscriptions/components/billing-panel';
import { getFarmContext } from '@/modules/farms/server';
import { serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'Plan & billing' };

export default async function BillingPage({ params }: { params: Promise<{ farm: string }> }) {
  const { farm } = await params;
  const ctx = await getFarmContext(farm);
  if (!ctx.membership.permissions.includes('billing.view')) notFound();
  const [overview, invoices] = await Promise.all([
    serverFetch<BillingOverview>(`/farms/${farm}/billing`),
    serverFetch<{ invoices: FarmInvoice[] }>(`/farms/${farm}/billing/invoices`),
  ]);
  if (!overview) throw new Error('Could not load billing details');
  return <BillingPanel overview={overview} invoices={invoices?.invoices ?? []} />;
}
