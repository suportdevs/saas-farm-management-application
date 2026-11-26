'use client';

import { useFarm } from '@/modules/farms/context';
import { usePlans } from './use-plans';

/** Why downloads are locked and where to upgrade (shown by a locked Download button). */
/** `message` is an English phrase with `{plan}` (translated where it is shown). */
export type ExportLock = { message: string; vars?: Record<string, string>; href?: string };

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
    message: canBill
      ? 'Downloading data (Excel, PDF, CSV and more) is included from the {plan} plan.'
      : 'Downloading data (Excel, PDF, CSV and more) is included from the {plan} plan. Ask the farm owner to upgrade.',
    vars: { plan: plan?.name ?? 'paid' },
    href: canBill ? `/farms/${farm.slug}/billing` : undefined,
  };
}
