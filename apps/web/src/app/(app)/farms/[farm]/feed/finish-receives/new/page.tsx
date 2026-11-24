import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFarmContext } from '@/modules/farms/server';
import { FinishReceiveForm } from '@/modules/feed/components/finish-receive-form';

export const metadata: Metadata = { title: 'New finish receive' };

/** /farms/<farm>/feed/finish-receives/new */
export default async function NewFinishReceivePage({ params }: { params: Promise<{ farm: string }> }) {
  const { farm } = await params;
  const ctx = await getFarmContext(farm);
  if (!ctx.membership.permissions.includes('feed.finish_receive_create')) notFound();
  return <FinishReceiveForm />;
}
