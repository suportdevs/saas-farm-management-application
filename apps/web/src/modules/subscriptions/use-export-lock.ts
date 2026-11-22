'use client';

import { useFarm } from '@/modules/farms/context';
import { usePlans } from './use-plans';

/** Why downloads are locked and where to upgrade (shown by a locked Download button). */
export type ExportLock = { message: string; href?: string };

/**
 * Downloads (Excel, PDF, CSV…) are a plan feature (`data_export`). On a plan
 * without it this returns the upgrade message; otherwise null.
 */
export function useExportLock(): ExportLock | null {
  const { farm, capabilities, membership } = useFarm();
  const plans = usePlans();
  if (capabilities.includes('data_export')) return null;

  // The first (cheapest) plan on offer that includes it, e.g. "Growth".
  const plan = plans.find((p) => p.capabilities.includes('data_export'));
  const canBill = membership.permissions.includes('billing.view');
  return {
    message: `Downloading data (Excel, PDF, CSV and more) is included from the ${plan?.name ?? 'paid'} plan.${canBill ? '' : ' Ask the farm owner to upgrade.'}`,
    href: canBill ? `/farms/${farm.slug}/billing` : undefined,
  };
}
