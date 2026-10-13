import Link from 'next/link';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { buttonClasses } from '@/components/ui/button';
import { getSession } from '@/lib/session';
import { publicNavItems } from '@/modules/registry';

const NAV = [
  { href: '/#features', label: 'Features' },
  { href: '/#global', label: 'Worldwide' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/pricing#faq', label: 'FAQ' },
];

export async function SiteHeader() {
  const { user } = await getSession();
  const items = [...NAV, ...publicNavItems.filter((i) => !NAV.some((n) => n.href === i.href))];
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/70 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-10">
          <Logo />
          <nav className="hidden gap-7 text-sm font-medium text-muted-foreground md:flex">
            {items.map((item) => (
              <Link key={item.href} href={item.href} className="transition-colors hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <Link href="/dashboard" className={buttonClasses('primary', 'sm')}>
              Open app
            </Link>
          ) : (
            <>
              <Link href="/login" className={buttonClasses('ghost', 'sm')}>
                Sign in
              </Link>
              <Link href="/register" className={buttonClasses('primary', 'sm')}>
                Start free trial
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
