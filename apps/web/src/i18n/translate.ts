import type { Language } from '@kit/shared';
import { bn } from './messages/bn';
import { hi } from './messages/hi';

/**
 * Translation by English phrase (gettext style): code writes the English text,
 * `t('Add batch')`, and each language file maps that phrase to its own text.
 * English is the mandatory base — a phrase missing in a file shows in English.
 *
 * Variables go in braces: t('Showing {from}–{to} of {total}', { from: 1, to: 25, total: 80 }).
 */
const MESSAGES: Record<Language, Record<string, string>> = { en: {}, bn, hi };

export type TranslateVars = Record<string, string | number>;
export type T = (text: string, vars?: TranslateVars) => string;

export function translate(language: Language, text: string, vars?: TranslateVars): string {
  const phrase = MESSAGES[language]?.[text] ?? text;
  if (!vars) return phrase;
  return phrase.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** A `t` bound to one language. */
export const translator =
  (language: Language): T =>
  (text, vars) =>
    translate(language, text, vars);
