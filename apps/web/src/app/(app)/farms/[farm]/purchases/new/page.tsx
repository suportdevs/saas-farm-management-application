import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFarmContext } from '@/modules/farms/server';
import { PurchaseForm } from '@/modules/purchases/components/purchase-form';

export const metadata: Metadata = { title: 'New purchase' };

/** /farms/<farm>/purchases/new */
export default async function NewPurchasePage({ params }: { params: Promise<{ farm: string }> }) {
  const { farm } = await params;
  const ctx = await getFarmContext(farm);
  if (!ctx.membership.permissions.includes('purchase.purchase_create')) notFound();
  return <PurchaseForm />;
}
