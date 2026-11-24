import { redirect } from 'next/navigation';
import { ModuleLocked } from '@/components/app/module-locked';
import { getFarmContext } from '@/modules/farms/server';

/** /farms/<farm>/feed has no page of its own yet: open the finish receives (or explain why Feed is locked). */
export default async function Page({ params }: { params: Promise<{ farm: string }> }) {
  const { farm } = await params;
  const ctx = await getFarmContext(farm);
  if (ctx.modules.feed !== 'enabled') return <ModuleLocked ctx={ctx} module="feed" />;
  redirect(`/farms/${farm}/feed/finish-receives`);
}
