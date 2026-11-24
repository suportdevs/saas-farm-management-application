import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PurchaseForm } from '@/modules/purchases/components/purchase-form';
import { getPurchase } from '@/modules/purchases/server';

export const metadata: Metadata = { title: 'Purchase' };

/** /farms/<farm>/purchases/<key> — view or edit (read-only without the edit permission). */
export default async function PurchasePage({ params }: { params: Promise<{ farm: string; key: string }> }) {
  const { farm, key } = await params;
  const purchase = await getPurchase(farm, key);
  if (!purchase) notFound();
  return <PurchaseForm purchase={purchase} />;
}
