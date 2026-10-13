'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { COUNTRY_CODES, COUNTRY_CURRENCY, LOCALES } from '@kit/shared';
import { countryName, currencyName, flag, tzOffset } from '@/lib/format';

/**
 * Option labels come from the runtime's Intl data (region names, sorting,
 * live UTC offsets), which differs between Node and browsers. To avoid
 * hydration mismatches, the server renders only the selected option and the
 * full localised list appears once hydrated.
 */
const noop = () => () => {};
function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function CountryOptions({ current }: { current: string }) {
  const hydrated = useHydrated();
  const options = useMemo(
    () => (hydrated ? COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [hydrated],
  );
  if (!hydrated) return <option value={current}>{current}</option>;
  return (
    <>
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {flag(o.code)} {o.name}
        </option>
      ))}
    </>
  );
}

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
}

export function TimeZoneOptions({ current }: { current: string }) {
  const hydrated = useHydrated();
  const zones = useMemo(() => {
    if (!hydrated) return [];
    const all = timeZones();
    return all.includes(current) ? all : [current, ...all];
  }, [current, hydrated]);
  if (!hydrated) return <option value={current}>{current}</option>;
  return (
    <>
      {zones.map((tz) => (
        <option key={tz} value={tz}>
          {tz.replace(/_/g, ' ')} ({tzOffset(tz)})
        </option>
      ))}
    </>
  );
}

export function CurrencyOptions({ current }: { current: string }) {
  const hydrated = useHydrated();
  const codes = useMemo(() => {
    const all = [...new Set(Object.values(COUNTRY_CURRENCY))].sort();
    return all.includes(current) ? all : [current, ...all];
  }, [current]);
  if (!hydrated) return <option value={current}>{current}</option>;
  return (
    <>
      {codes.map((code) => (
        <option key={code} value={code}>
          {code} — {currencyName(code)}
        </option>
      ))}
    </>
  );
}

export function LocaleOptions({ current }: { current?: string }) {
  const list = current && !LOCALES.some((l) => l.tag === current) ? [{ tag: current, label: current }, ...LOCALES] : LOCALES;
  return (
    <>
      {list.map((l) => (
        <option key={l.tag} value={l.tag}>
          {l.label}
        </option>
      ))}
    </>
  );
}

/** Best-guess country from the browser locale (e.g. "en-NZ" → "NZ"). */
export function guessCountry(): string | null {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return region && COUNTRY_CURRENCY[region] ? region : null;
  } catch {
    return null;
  }
}

/** A supported display locale that matches the browser, else en-US. */
export function guessLocale(country: string): string {
  const browser = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  const exact = LOCALES.find((l) => l.tag.toLowerCase() === browser.toLowerCase());
  if (exact) return exact.tag;
  const sameRegion = LOCALES.find((l) => l.tag.endsWith(`-${country}`));
  return sameRegion?.tag ?? 'en-US';
}
