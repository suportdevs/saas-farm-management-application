import { FARM_TYPE_INFO, type FarmContext } from '@kit/shared';
import { countryName } from './format';

/**
 * The company block printed at the top of PDF, Excel and printed downloads,
 * like the head of a letter: name, a short line under it, then address,
 * contact and legal lines.
 */
export interface Letterhead {
  name: string;
  tagline?: string;
  lines: string[];
}

/** Used outside a farm (admin pages). */
export const PLATFORM_LETTERHEAD: Letterhead = { name: 'HerdSphere', tagline: 'Platform administration', lines: [] };

/** A farm's letterhead from its profile (Farm settings). Empty fields are left out. */
export function farmLetterhead({ farm, organization }: Pick<FarmContext, 'farm' | 'organization'>): Letterhead {
  const join = (parts: (string | null | undefined)[], sep: string) => parts.filter(Boolean).join(sep);
  return {
    name: farm.name,
    tagline: join([FARM_TYPE_INFO[farm.type] && `${FARM_TYPE_INFO[farm.type].label} farm`, organization.name !== farm.name ? organization.name : null], ' · '),
    lines: [
      join([farm.address, farm.city, farm.region, farm.postalCode, countryName(farm.country)], ', '),
      join([farm.phone && `Tel ${farm.phone}`, farm.email, farm.website], '  ·  '),
      join([farm.registrationNumber && `Reg. no. ${farm.registrationNumber}`, farm.taxId && `Tax ID ${farm.taxId}`], '  ·  '),
    ].filter(Boolean),
  };
}

/** "Green Valley Dairy" → "GV". */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '•';
