import Link from 'next/link';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { getFarms } from '@/modules/farms/server';
import { requireUser } from '@/lib/session';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const farms = await getFarms();
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="bg-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo href={farms.length ? '/dashboard' : '/onboarding'} />
        <div className="flex items-center gap-2">
          {farms.length > 0 && (
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              Back to app
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>
      <main className="relative mx-auto max-w-6xl px-6 pb-16 pt-4">{children}</main>
    </div>
  );
}
