'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { applyPrefs, applyTheme, DEFAULT_PREFS, readTheme, savePrefs, saveTheme, type ThemeMode, type UiPrefs } from '@/lib/preferences';

interface PreferencesValue {
  prefs: UiPrefs;
  setPref: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => void;
  /** Back to the default look (theme included). */
  reset: () => void;
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

/** Holds the look-and-feel preferences for the app shell. `initial` comes from the cookie, read on the server. */
export function PreferencesProvider({ initial, children }: { initial: UiPrefs; children: ReactNode }) {
  const [prefs, setPrefs] = useState(initial);
  // The theme is only known in the browser (localStorage); the <head> script already applied it.
  const [theme, setThemeState] = useState<ThemeMode>('system');
  useEffect(() => setThemeState(readTheme()), []);

  // Follow the operating system while "System" is selected.
  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const update = (next: UiPrefs) => {
    setPrefs(next);
    savePrefs(next);
    applyPrefs(next);
  };

  const value: PreferencesValue = {
    prefs,
    setPref: (key, v) => update({ ...prefs, [key]: v }),
    reset: () => {
      update(DEFAULT_PREFS);
      saveTheme('system');
      setThemeState('system');
    },
    theme,
    setTheme: (mode) => {
      saveTheme(mode);
      setThemeState(mode);
    },
  };

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return ctx;
}
