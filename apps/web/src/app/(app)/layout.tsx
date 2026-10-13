import { ImpersonationBanner } from '@/components/app/impersonation-banner';
import { VerifyEmailBanner } from '@/components/app/verify-email-banner';
import { VerifyEmailRequired } from '@/components/app/verify-email-required';
import { Logo } from '@/components/logo';
import { SidebarContent } from '@/components/shell/app-sidebar';
import { MobileNav } from '@/components/shell/mobile-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { getFarms } from '@/modules/farms/server';
import { getFeatures, getSession, requireUser } from '@/lib/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [{ impersonator }, features, farms] = await Promise.all([getSession(), getFeatures(), getFarms()]);
  const verification = features?.auth?.emailVerification ?? 'optional';
  if (!user.emailVerified && verification === 'required') return <VerifyEmailRequired email={user.email} />;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16.5rem_1fr]">
      <aside className="hidden lg:sticky lg:top-0 lg:block lg:h-screen">
        <SidebarContent user={user} farms={farms} />
      </aside>
      <div className="flex min-w-0 flex-col">
        {impersonator && <ImpersonationBanner impersonator={impersonator} userName={user.name} />}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md lg:hidden">
          <MobileNav user={user} farms={farms} />
          <Logo href="/dashboard" />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        {!user.emailVerified && verification !== 'off' && <VerifyEmailBanner email={user.email} />}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
