import { cookies } from 'next/headers';
import { ImpersonationBanner } from '@/components/app/impersonation-banner';
import { VerifyEmailBanner } from '@/components/app/verify-email-banner';
import { VerifyEmailRequired } from '@/components/app/verify-email-required';
import { AppShell } from '@/components/shell/app-shell';
import { PreferencesProvider } from '@/components/shell/preferences-provider';
import { I18nProvider } from '@/i18n/provider';
import { getFarms } from '@/modules/farms/server';
import { getFeatures, getSession, requireUser } from '@/lib/session';
import { parsePrefs, PREFS_COOKIE } from '@/lib/preferences';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [{ impersonator }, features, farms, cookieStore] = await Promise.all([getSession(), getFeatures(), getFarms(), cookies()]);
  const verification = features?.auth?.emailVerification ?? 'optional';
  if (!user.emailVerified && verification === 'required') return <VerifyEmailRequired email={user.email} />;
  // Layout preferences (menu position, width, zoom) from the cookie, so the first render already matches.
  const prefs = parsePrefs(cookieStore.get(PREFS_COOKIE)?.value);

  return (
    <PreferencesProvider initial={prefs}>
      {/* Interface language: the user's own, else the current farm's default, else English. */}
      <I18nProvider userLanguage={user.language} farms={farms}>
      <AppShell
        user={user}
        farms={farms}
        topBanner={impersonator && <ImpersonationBanner impersonator={impersonator} userName={user.name} />}
        banner={!user.emailVerified && verification !== 'off' && <VerifyEmailBanner email={user.email} />}
      >
        {children}
      </AppShell>
      </I18nProvider>
    </PreferencesProvider>
  );
}
