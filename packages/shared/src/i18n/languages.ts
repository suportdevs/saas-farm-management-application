/**
 * Interface languages. English is the mandatory base: every text exists in
 * English, and a phrase missing in another language shows in English.
 * Add a language here and a messages file in apps/web/src/i18n/messages/.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'bn', label: 'Bangla', native: 'বাংলা' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];
export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [Language, ...Language[]];
export const DEFAULT_LANGUAGE: Language = 'en';

export const isLanguage = (v: unknown): v is Language => typeof v === 'string' && (LANGUAGE_CODES as string[]).includes(v);

/**
 * The language a person sees: their own choice, else the farm's default,
 * else English.
 */
export const resolveLanguage = (userLanguage?: string | null, farmLanguage?: string | null): Language =>
  isLanguage(userLanguage) ? userLanguage : isLanguage(farmLanguage) ? farmLanguage : DEFAULT_LANGUAGE;
