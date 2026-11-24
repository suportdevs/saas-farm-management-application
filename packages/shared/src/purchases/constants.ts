import type { CatalogChoice } from '../products/catalog';

/** Where the animals were bought. */
export const PURCHASE_SOURCE_TYPES = [
  { value: 'haat', label: 'Haat (cattle market)' },
  { value: 'farmer', label: 'Farmer' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'import', label: 'Import' },
] as const satisfies readonly CatalogChoice[];

export type PurchaseSourceType = (typeof PURCHASE_SOURCE_TYPES)[number]['value'];

/** Most item lines one purchase can have. */
export const PURCHASE_MAX_ITEMS = 500;

/**
 * Splits the shared costs (transport, broker fee, toll, other) over the
 * animals by price share: an animal that is 20 % of the total price carries
 * 20 % of the shared costs. Worked in cents; the last line takes the rounding
 * remainder so the parts always add up. Free animals (total price 0) split
 * it equally. Used by the form (live totals) and the API (stored values).
 */
export function splitSharedCost(prices: number[], shared: number): number[] {
  if (prices.length === 0) return [];
  const sharedCents = Math.round(shared * 100);
  const total = prices.reduce((sum, p) => sum + p, 0);
  const parts = prices.map((p) => Math.floor((total > 0 ? sharedCents * p / total : sharedCents / prices.length)));
  const used = parts.reduce((sum, c) => sum + c, 0);
  parts[parts.length - 1]! += sharedCents - used;
  return parts.map((c) => c / 100);
}

/** Transport + broker fee + toll + other. */
export const sharedCostOf = (p: { transportCost?: number | null; brokerFee?: number | null; tollCost?: number | null; otherCost?: number | null }) =>
  (p.transportCost ?? 0) + (p.brokerFee ?? 0) + (p.tollCost ?? 0) + (p.otherCost ?? 0);
