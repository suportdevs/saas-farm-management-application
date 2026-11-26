'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { resolveLanguage, type Language } from '@kit/shared';
import { translator, type T } from './translate';

type I18nValue = { language: Language; t: T; /** The user's own choice (null = farm default). */ userLanguage: string | null };
const I18nContext = createContext<I18nValue>({ language: 'en', t: translator('en'), userLanguage: null });

/**
 * Picks the language for the signed-in app: the user's own choice, else the
 * default of the farm in the URL (/farms/<slug>/…), else English.
 */
export function I18nProvider({ userLanguage, farms, children }: { userLanguage?: string | null; farms: { slug: string; language: string }[]; children: ReactNode }) {
  const pathname = usePathname();
  const slug = pathname.match(/^\/farms\/([^/]+)/)?.[1];
  const farmLanguage = slug ? farms.find((f) => f.slug === slug)?.language : undefined;
  const language = resolveLanguage(userLanguage, farmLanguage);
  const value = useMemo(() => ({ language, t: translator(language), userLanguage: userLanguage ?? null }), [language, userLanguage]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** `t('Add batch')` in the current language (English when no translation exists). */
export const useT = () => useContext(I18nContext).t;

/** The language the user picked themselves, or null when they follow the farm's default. */
export const useUserLanguage = () => useContext(I18nContext).userLanguage;

/** The current interface language code (en, bn, hi…). */
export const useLanguage = () => useContext(I18nContext).language;
