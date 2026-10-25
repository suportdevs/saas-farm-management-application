import type { Metadata } from 'next';
import { canManageOrg, planName } from '@kit/shared';
import { FarmWizard } from '@/modules/farms/components/farm-wizard';
import { getFarms, getOrganizations } from '@/modules/farms/server';
import { getFeatures, requireUser } from '@/lib/session';
import { getPlans } from '@/modules/subscriptions/server';

export const metadata: Metadata = { title: 'Set up your farm' };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const [user, farms, features, plans, orgs, { org }] = await Promise.all([requireUser(), getFarms(), getFeatures(), getPlans(), getOrganizations(), searchParams]);
  const { trialDays = 0, trialPlan } = (features?.farms as { trialDays?: number; trialPlan?: string } | undefined) ?? {};
  const manageable = orgs.filter((o) => canManageOrg(o.role)).map(({ id, name }) => ({ id, name }));
  return (
    <FarmWizard
      firstName={user.name.split(' ')[0] ?? user.name}
      isFirstFarm={farms.length === 0}
      trialDays={trialDays}
      trialPlanName={planName(plans, trialPlan) || 'the full product'}
      organizations={manageable}
      organizationId={manageable.some((o) => o.id === org) ? org : undefined}
    />
  );
}
