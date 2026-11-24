import type { FarmProfile } from '@kit/shared';

/** An amount in the farm's currency, e.g. "৳1,450.00". Amounts are whole units, not cents. */
export const money = (farm: Pick<FarmProfile, 'currency' | 'locale'>, value: number) =>
  new Intl.NumberFormat(farm.locale, { style: 'currency', currency: farm.currency }).format(value);
