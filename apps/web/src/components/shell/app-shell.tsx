'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AppBar } from './app-bar';
import { SidebarContent, type ShellProps } from './app-sidebar';
import { HorizontalNav } from './horizontal-nav';
import { usePreferences } from './preferences-provider';

/**
 * Lays out the signed-in app from the user's preferences:
 * - left / right: a sidebar (full or icons-only) beside the page;
 * - top / bottom: a horizontal menu bar under the top bar, or fixed at the bottom.
 * Below the `lg` breakpoint every option uses the top bar + slide-out menu.
 *
 * `topBanner` sits above the top bar (impersonation); `banner` right below it (verify email).
 */
export function AppShell({ user, farms, topBanner, banner, children }: ShellProps & { topBanner?: ReactNode; banner?: ReactNode; children: ReactNode }) {
  const { prefs } = usePreferences();

  const main = (
    <main
      // Content zoom (top bar − / +). Only the page content scales; menus keep their size.
      style={prefs.zoom !== 100 ? { zoom: prefs.zoom / 100 } : undefined}
      className={cn('w-full flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10', prefs.width === 'boxed' && 'mx-auto max-w-6xl', prefs.nav === 'bottom' && 'lg:pb-24')}
    >
      {children}
    </main>
  );

  if (prefs.nav === 'left' || prefs.nav === 'right') {
    return (
      <div className={cn('min-h-screen lg:flex', prefs.nav === 'right' && 'lg:flex-row-reverse')}>
        <aside className={cn('hidden shrink-0 lg:sticky lg:top-0 lg:block lg:h-screen', prefs.collapsed ? 'lg:w-[4.5rem]' : 'lg:w-[16.5rem]')}>
          <SidebarContent user={user} farms={farms} collapsed={prefs.collapsed} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          {topBanner}
          <AppBar user={user} farms={farms} />
          {banner}
          {main}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {topBanner}
      <AppBar user={user} farms={farms} />
      {prefs.nav === 'top' && (
        <div className="sticky top-14 z-20 hidden lg:block">
          <HorizontalNav user={user} farms={farms} position="top" />
        </div>
      )}
      {banner}
      {main}
      {prefs.nav === 'bottom' && (
        <div className="fixed inset-x-0 bottom-0 z-30 hidden lg:block">
          <HorizontalNav user={user} farms={farms} position="bottom" />
        </div>
      )}
    </div>
  );
}
