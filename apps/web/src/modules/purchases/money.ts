import { PURCHASE_SOURCE_TYPES, type FarmProfile } from '@kit/shared';

/** An amount in the farm's currency, e.g. "৳61,200.00". Purchase amounts are whole units, not cents. */
export const money = (farm: Pick<FarmProfile, 'currency' | 'locale'>, value: number) =>
  new Intl.NumberFormat(farm.locale, { style: 'currency', currency: farm.currency }).format(value);

/** "Haat (cattle market)" for "haat". */
export const sourceLabel = (value: string) => PURCHASE_SOURCE_TYPES.find((s) => s.value === value)?.label ?? value;
