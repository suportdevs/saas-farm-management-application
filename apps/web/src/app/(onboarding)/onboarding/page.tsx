import type { Metadata } from 'next';
import { FarmWizard } from '@/modules/farms/components/farm-wizard';
import { getFarms } from '@/modules/farms/server';
import { getFeatures, requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Set up your farm' };

export default async function OnboardingPage() {
  const [user, farms, features] = await Promise.all([requireUser(), getFarms(), getFeatures()]);
  const trial = (features?.farms as { trialDays?: number } | undefined)?.trialDays ?? 0;
  return <FarmWizard firstName={user.name.split(' ')[0] ?? user.name} isFirstFarm={farms.length === 0} trialDays={trial} />;
}
