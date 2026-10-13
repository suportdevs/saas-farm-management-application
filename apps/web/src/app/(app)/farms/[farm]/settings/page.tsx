import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FarmSettingsForm } from '@/modules/farms/components/farm-settings-form';
import { getFarmContext } from '@/modules/farms/server';

export const metadata: Metadata = { title: 'Farm settings' };

export default async function FarmSettingsPage({ params }: { params: Promise<{ farm: string }> }) {
  const { farm } = await params;
  const ctx = await getFarmContext(farm);
  if (!ctx.membership.permissions.includes('farm.update')) notFound();
  return <FarmSettingsForm />;
}
