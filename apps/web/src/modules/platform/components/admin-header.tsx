'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import type { PlatformPermission } from '@kit/shared';
import { Badge } from '@/components/ui/badge';
import { findPlatformPage } from '../navigation';
import { CommandPalette } from './command-palette';

/**
 * Top of every /admin page: breadcrumbs, the page title from the platform
 * menu, the viewer's staff role and quick search (Ctrl/⌘ + K).
 * Detail pages (e.g. one tenant) show only the breadcrumbs — they have their own heading.
 */
export function AdminHeader({ roleName, permissions }: { roleName?: string | null; permissions: PlatformPermission[] }) {
  const pathname = usePathname();
  const page = findPlatformPage(pathname);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const crumbs = [
    { label: 'Platform admin', href: '/admin' },
    ...(page?.section ? [{ label: page.section, href: null }] : []),
    ...(page && page.link.href !== '/admin' ? [{ label: page.link.label, href: page.detail ? page.link.href : null }] : []),
    ...(page?.detail ? [{ label: 'Details', href: null }] : []),
  ];

  return (
    <div className={page?.detail ? 'mb-4' : 'mb-8'}>
      <div className="flex items-center justify-between gap-4">
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
                {c.href && i < crumbs.length - 1 ? (
                  <Link href={c.href} className="hover:text-foreground">
                    {c.label}
                  </Link>
                ) : (
                  <span className={i === crumbs.length - 1 ? 'font-medium text-foreground' : undefined}>{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          {roleName && <Badge variant="primary">{roleName}</Badge>}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:text-foreground sm:w-56"
            aria-label="Quick search"
          >
            <Search className="h-4 w-4" />
            <span className="hidden flex-1 text-left sm:inline">Search…</span>
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
          </button>
        </div>
      </div>

      {page && !page.detail && (
        <div className="mt-4">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{page.link.label}</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-base">{page.link.description}</p>
        </div>
      )}

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} permissions={permissions} />
    </div>
  );
}
