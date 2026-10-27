/**
 * Look-and-feel preferences for the app (Settings panel in the top bar).
 *
 * - Theme (light / dark / system) lives in localStorage `theme`, as before.
 * - Everything else lives in one small `ui-prefs` cookie, so the server can
 *   render the chosen layout (sidebar position, width, zoom) without a flash,
 *   and the inline <head> script can apply colors and fonts before paint.
 *
 * Preferences are per browser — they are not saved to the user's account.
 */

export const PREFS_COOKIE = 'ui-prefs';

export const COLORS = [
  { key: 'forest', label: 'Forest', swatch: 'oklch(0.53 0.14 152)' },
  { key: 'ocean', label: 'Ocean', swatch: 'oklch(0.53 0.14 245)' },
  { key: 'indigo', label: 'Indigo', swatch: 'oklch(0.53 0.14 275)' },
  { key: 'violet', label: 'Violet', swatch: 'oklch(0.53 0.14 305)' },
  { key: 'rose', label: 'Rose', swatch: 'oklch(0.53 0.14 10)' },
  { key: 'orange', label: 'Orange', swatch: 'oklch(0.53 0.14 45)' },
  { key: 'teal', label: 'Teal', swatch: 'oklch(0.53 0.14 195)' },
] as const;

export const FONTS = [
  { key: 'geist', label: 'Geist', sample: 'var(--font-geist-sans)' },
  { key: 'inter', label: 'Inter', sample: 'var(--font-inter)' },
  { key: 'system', label: 'System', sample: 'system-ui' },
  { key: 'serif', label: 'Serif', sample: 'ui-serif, Georgia, serif' },
] as const;

export const SIZES = [
  { key: 'sm', label: 'Small' },
  { key: 'md', label: 'Default' },
  { key: 'lg', label: 'Large' },
] as const;

export const NAV_POSITIONS = ['left', 'right', 'top', 'bottom'] as const;
export const ZOOM_LEVELS = [80, 90, 100, 110, 125, 150] as const;

export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorKey = (typeof COLORS)[number]['key'];
export type FontKey = (typeof FONTS)[number]['key'];
export type SizeKey = (typeof SIZES)[number]['key'];
export type NavPosition = (typeof NAV_POSITIONS)[number];

export interface UiPrefs {
  color: ColorKey;
  font: FontKey;
  size: SizeKey;
  /** "brand" keeps the dark forest sidebar; "theme" matches the light/dark theme. */
  sidebar: 'brand' | 'theme';
  nav: NavPosition;
  /** Icons-only sidebar (left / right positions). */
  collapsed: boolean;
  width: 'boxed' | 'full';
  /** Content zoom in percent. */
  zoom: number;
}

export const DEFAULT_PREFS: UiPrefs = { color: 'forest', font: 'geist', size: 'md', sidebar: 'brand', nav: 'left', collapsed: false, width: 'boxed', zoom: 100 };

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);

/** Reads the cookie value; anything missing or invalid falls back to the default. */
export function parsePrefs(raw: string | undefined | null): UiPrefs {
  let data: Partial<Record<keyof UiPrefs, unknown>> = {};
  try {
    if (raw) data = JSON.parse(decodeURIComponent(raw)) as typeof data;
  } catch {
    // Broken cookie: use the defaults.
  }
  return {
    color: oneOf(data.color, COLORS.map((c) => c.key), DEFAULT_PREFS.color),
    font: oneOf(data.font, FONTS.map((f) => f.key), DEFAULT_PREFS.font),
    size: oneOf(data.size, SIZES.map((s) => s.key), DEFAULT_PREFS.size),
    sidebar: oneOf(data.sidebar, ['brand', 'theme'] as const, DEFAULT_PREFS.sidebar),
    nav: oneOf(data.nav, NAV_POSITIONS, DEFAULT_PREFS.nav),
    collapsed: data.collapsed === true,
    width: oneOf(data.width, ['boxed', 'full'] as const, DEFAULT_PREFS.width),
    zoom: ZOOM_LEVELS.includes(data.zoom as never) ? (data.zoom as number) : DEFAULT_PREFS.zoom,
  };
}

export function savePrefs(prefs: UiPrefs) {
  document.cookie = `${PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(prefs))}; path=/; max-age=31536000; samesite=lax`;
}

/** Puts colors, font, text size and sidebar style on <html> (CSS in globals.css reads them). */
export function applyPrefs(prefs: UiPrefs) {
  const html = document.documentElement;
  const set = (name: string, value: string | null) => (value ? html.setAttribute(name, value) : html.removeAttribute(name));
  set('data-color', prefs.color === 'forest' ? null : prefs.color);
  set('data-font', prefs.font === 'geist' ? null : prefs.font);
  set('data-size', prefs.size === 'md' ? null : prefs.size);
  set('data-sidebar', prefs.sidebar === 'brand' ? null : prefs.sidebar);
}

// ─── Theme ───────────────────────────────────────────────────────

export function readTheme(): ThemeMode {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export const systemPrefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark' || (mode === 'system' && systemPrefersDark()));
}

export function saveTheme(mode: ThemeMode) {
  try {
    if (mode === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', mode);
  } catch {}
  applyTheme(mode);
}

/**
 * Inline script for <head>: applies the theme and the cookie preferences
 * before the first paint, on every page (no flash of the default look).
 */
export const prefsScript = `(function(){try{var d=document.documentElement,t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))d.classList.add('dark');var m=document.cookie.match(/(?:^|; )${PREFS_COOKIE}=([^;]*)/);if(!m)return;var p=JSON.parse(decodeURIComponent(m[1]));if(p.color&&p.color!=='forest')d.setAttribute('data-color',p.color);if(p.font&&p.font!=='geist')d.setAttribute('data-font',p.font);if(p.size&&p.size!=='md')d.setAttribute('data-size',p.size);if(p.sidebar==='theme')d.setAttribute('data-sidebar','theme')}catch(e){}})()`;
