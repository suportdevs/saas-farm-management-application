import type { FarmProfile } from '@kit/shared';

/** Locale-aware money from minor units (cents). */
export function formatMoney(minor: number, currency: string, locale?: string, opts: { compact?: boolean } = {}) {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const value = minor / 10 ** digits;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: opts.compact || Number.isInteger(value) ? 0 : digits,
    notation: opts.compact ? 'compact' : 'standard',
  }).format(value);
}

export const formatNumber = (n: number, locale?: string, digits = 0) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);

/** A date shown in the farm's own time zone and locale. */
export function formatFarmDate(iso: string, farm: Pick<FarmProfile, 'locale' | 'timezone'>, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  return new Intl.DateTimeFormat(farm.locale, { timeZone: farm.timezone, ...opts }).format(new Date(iso));
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  return new Intl.DateTimeFormat(undefined, opts).format(new Date(iso));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86400],
  ['month', 30 * 86400],
  ['week', 7 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

export function timeAgo(iso: string, locale?: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, 'minute');
}

let regionNames: Intl.DisplayNames | null = null;
export function countryName(code: string, locale = 'en') {
  try {
    regionNames ??= new Intl.DisplayNames([locale], { type: 'region' });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Regional-indicator emoji flag, e.g. "NZ" → 🇳🇿. */
export const flag = (code: string) =>
  code.length === 2 ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '';

export function currencyName(code: string, locale = 'en') {
  try {
    return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** UTC offset label for a time zone, e.g. "GMT+12". */
export function tzOffset(timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
