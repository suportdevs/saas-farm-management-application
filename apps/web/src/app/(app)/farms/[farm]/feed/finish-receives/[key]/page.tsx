import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ModuleLocked } from '@/components/app/module-locked';
import { getFarmContext } from '@/modules/farms/server';
import { FinishReceiveForm } from '@/modules/feed/components/finish-receive-form';
import { getFinishReceive } from '@/modules/feed/server';

export const metadata: Metadata = { title: 'Finish receive' };

/** /farms/<farm>/feed/finish-receives/<key> — edit while pending, read-only once processed. */
export default async function FinishReceivePage({ params }: { params: Promise<{ farm: string; key: string }> }) {
  const { farm, key } = await params;
  const ctx = await getFarmContext(farm);
  if (ctx.modules.feed !== 'enabled') return <ModuleLocked ctx={ctx} module="feed" />;
  const receive = await getFinishReceive(farm, key);
  if (!receive) notFound();
  return <FinishReceiveForm receive={receive} />;
}
