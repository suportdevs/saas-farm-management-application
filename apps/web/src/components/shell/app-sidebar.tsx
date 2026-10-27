'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, ChevronDown, Lock, LogOut, Moon, Settings, Shield, ShieldCheck, Sun, UserRound } from 'lucide-react';
import type { FarmSummary, PublicUser } from '@kit/shared';
import { Avatar } from '@/components/app/user-menu';
import { LogoBadge } from '@/components/logo';
import { Menu, MenuSeparator, menuItemClasses } from '@/components/ui/menu';
import { api } from '@/lib/api';
import { farmNav, type NavLink, type NavSection } from '@/modules/farms/navigation';
import { appName, cn } from '@/lib/utils';
import { moduleNavItems } from '@/modules/registry';
import { FarmSwitcher, FarmTile } from '@/modules/farms/components/farm-switcher';
import { platformNav } from '@/modules/platform/navigation';
import { usePreferences } from './preferences-provider';

export interface ShellProps {
  user: PublicUser;
  farms: FarmSummary[];
}

/** The farm in view: from the URL inside /farms/[farm], else the most recently used one. */
export function useCurrentFarm(farms: FarmSummary[]) {
  const pathname = usePathname();
  const slug = /^\/farms\/([^/]+)/.exec(pathname)?.[1];
  return (slug && farms.find((f) => f.slug === slug)) || farms[0];
}

/** Farm menus the member can see: switched-off modules hidden, plan-locked ones shown with a lock. */
function farmSections(current: FarmSummary | undefined): NavSection[] {
  if (!current) return [];
  return farmNav(current.slug).map((section) => ({
    ...section,
    links: section.links.flatMap((l): NavLink[] => {
      const status = l.module && current.modules[l.module];
      if (status === 'disabled') return [];
      // Not in the plan: still listed, with a lock, so the upgrade is discoverable.
      if (status === 'plan') return [{ ...l, locked: true, children: undefined }];
      return !l.permission || current.permissions.includes(l.permission) ? [l] : [];
    }),
  }));
}

/**
 * Everything the app menu shows, shared by the sidebar and the top/bottom menu bar:
 * the farm (or platform admin) sections, then the "You" section.
 */
export function useNavSections({ user, farms }: ShellProps) {
  const pathname = usePathname();
  const current = useCurrentFarm(farms);
  // Platform staff inside /admin see the platform menus instead of the farm ones.
  const inPlatform = user.role === 'admin' && (pathname === '/admin' || pathname.startsWith('/admin/'));
  const main: NavSection[] = inPlatform ? platformNav(user.platformPermissions ?? []) : farmSections(current);

  const you: NavSection = {
    title: 'You',
    links: [
      // Items contributed by installed kit modules.
      ...moduleNavItems.map((item) => ({ ...item, icon: item.icon ?? Settings })),
      { href: '/organizations', label: 'Organizations', icon: Building2 },
      { href: '/settings', label: 'Account', icon: UserRound },
      ...(user.role === 'admin' && !inPlatform ? [{ href: '/admin', label: 'Platform admin', icon: Shield }] : []),
    ],
  };

  const isActive = (link: Pick<NavLink, 'href' | 'exact'>) => (link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`));
  return { pathname, current, inPlatform, sections: [...main, you].filter((s) => s.links.length), isActive };
}

/** The vertical sidebar (desktop left/right, and the phone drawer). `collapsed` shows icons only. */
export function SidebarContent({ user, farms, onNavigate, collapsed = false }: ShellProps & { onNavigate?: () => void; collapsed?: boolean }) {
  const { pathname, current, inPlatform, sections, isActive } = useNavSections({ user, farms });
  const backHref = current ? `/farms/${current.slug}` : '/dashboard';

  return (
    <div className="sidebar-surface flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        title={appName}
        className={cn('flex items-center gap-2.5 pb-4 pt-5 font-semibold tracking-tight', collapsed ? 'justify-center px-2' : 'px-5')}
      >
        <span className="relative">
          <span className="absolute inset-0 rounded-lg bg-sidebar-primary/50 blur-md" />
          <LogoBadge className="relative" />
        </span>
        {!collapsed && <span className="text-[17px]">{appName}</span>}
      </Link>

      <div className={collapsed ? 'flex justify-center px-2' : 'px-3'}>
        {collapsed ? (
          // Icons only: a shortcut to the farm (or back from admin); expand the sidebar to switch farms.
          <Link
            href={inPlatform ? backHref : current ? `/farms/${current.slug}` : '/onboarding'}
            onClick={onNavigate}
            title={inPlatform ? 'Platform admin — back to farm' : (current?.name ?? 'Create your farm')}
          >
            {inPlatform || !current ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary/20 text-sidebar-primary">
                <Shield className="h-4 w-4" />
              </span>
            ) : (
              <FarmTile farm={current} className="h-9 w-9" />
            )}
          </Link>
        ) : inPlatform ? (
          <PlatformHeader roleName={user.staffRoleName} backHref={backHref} onNavigate={onNavigate} />
        ) : (
          <FarmSwitcher farms={farms} current={current} onNavigate={onNavigate} />
        )}
      </div>

      <nav className={cn('scrollbar-sidebar mt-4 flex-1 overflow-y-auto pb-4', collapsed ? 'space-y-3 px-2' : 'space-y-5 px-3')} aria-label="Main">
        {sections.map((section, i) => (
          <div key={section.title ?? i}>
            {section.title &&
              (collapsed ? (
                <div className="mx-2 mb-3 h-px bg-sidebar-border" />
              ) : (
                <p className="mb-1.5 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted/80 after:h-px after:flex-1 after:bg-sidebar-border">
                  {section.title}
                </p>
              ))}
            <ul className="space-y-0.5">
              {section.links.map((link) => (
                <li key={link.href}>
                  {link.children && !collapsed ? (
                    <SidebarGroup link={link} pathname={pathname} onNavigate={onNavigate} />
                  ) : (
                    <SidebarLink link={link} active={isActive(link)} onNavigate={onNavigate} collapsed={collapsed} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('border-t border-sidebar-border', collapsed ? 'flex justify-center p-2' : 'p-3')}>
        <AccountMenu user={user} variant={collapsed ? 'compact' : 'sidebar'} />
      </div>
    </div>
  );
}

/** Shown instead of the farm switcher inside /admin: where you are, and the way back. */
export function PlatformHeader({ roleName, backHref, onNavigate }: { roleName?: string | null; backHref: string; onNavigate?: () => void }) {
  return (
    <div className="rounded-xl bg-sidebar-accent/70 px-2.5 py-2 ring-1 ring-sidebar-border">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/20 text-sidebar-primary">
          <Shield className="h-4 w-4" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">Platform admin</span>
          <span className="block truncate text-xs text-sidebar-muted">{roleName ?? 'Super admin'}</span>
        </span>
      </div>
      <Link href={backHref} onClick={onNavigate} className="mt-2 flex items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-sidebar-muted transition-colors hover:text-sidebar-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> {backHref === '/dashboard' ? 'Back to dashboard' : 'Back to farm'}
      </Link>
    </div>
  );
}

function SidebarLink({ link, active, onNavigate, collapsed }: { link: NavLink; active: boolean; onNavigate?: () => void; collapsed?: boolean }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? link.label : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors',
        collapsed ? 'justify-center px-2' : 'px-3',
        active
          ? 'bg-gradient-to-r from-sidebar-primary/25 via-sidebar-primary/10 to-transparent text-sidebar-active ring-1 ring-inset ring-sidebar-primary/20'
          : 'text-sidebar-muted hover:translate-x-0.5 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
      )}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-sidebar-primary shadow-[0_0_12px_var(--sidebar-primary)]" />}
      <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-sidebar-primary' : 'opacity-80 group-hover:opacity-100')} />
      {collapsed ? (
        link.locked && <Lock className="absolute right-1 top-1 h-2.5 w-2.5 text-sidebar-muted" aria-label="Upgrade to unlock" />
      ) : (
        <>
          <span className="flex-1 truncate">{link.label}</span>
          {link.locked ? (
            <Lock className="h-3.5 w-3.5 text-sidebar-muted" aria-label="Upgrade to unlock" />
          ) : (
            link.soon && <span className="rounded-full bg-sidebar-accent px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">Soon</span>
          )}
        </>
      )}
    </Link>
  );
}

/** A module with sub-pages: toggles open, and stays open while one of them is in view. */
function SidebarGroup({ link, pathname, onNavigate }: { link: NavLink; pathname: string; onNavigate?: () => void }) {
  const Icon = link.icon;
  const inside = pathname === link.href || pathname.startsWith(`${link.href}/`);
  const [open, setOpen] = useState(inside);
  useEffect(() => {
    if (inside) setOpen(true);
  }, [inside]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          inside ? 'text-sidebar-active' : 'text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
        )}
      >
        <Icon className={cn('h-[18px] w-[18px] shrink-0', inside ? 'text-sidebar-primary' : 'opacity-80 group-hover:opacity-100')} />
        <span className="flex-1 truncate text-left">{link.label}</span>
        <ChevronDown className={cn('h-4 w-4 opacity-70 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="ml-[21px] mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
          {link.children!.map((child) => {
            const active = pathname === child.href;
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block truncate rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                    active ? 'bg-sidebar-primary/15 text-sidebar-active' : 'text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                  )}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/**
 * The signed-in user's menu. `sidebar`: avatar + name (sidebar footer, opens upward);
 * `compact`: avatar only (collapsed sidebar); `appbar`: avatar only in the top bar (opens downward).
 */
export function AccountMenu({ user, variant = 'sidebar' }: { user: PublicUser; variant?: 'sidebar' | 'compact' | 'appbar' }) {
  const router = useRouter();
  const { theme, setTheme, prefs } = usePreferences();
  const [signingOut, setSigningOut] = useState(false);
  // Open toward the page: from the top bar, and from an icons-only sidebar on the right.
  const alignEnd = variant === 'appbar' || (variant === 'compact' && prefs.nav === 'right');
  const logout = async () => {
    setSigningOut(true);
    await api.post('/auth/logout').catch(() => {});
    router.push('/login');
    router.refresh();
  };
  const isDark = theme === 'dark' || (theme === 'system' && typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));

  return (
    <Menu
      label="Account menu"
      side={variant === 'appbar' ? 'bottom' : 'top'}
      align={alignEnd ? 'end' : 'start'}
      className="w-[15.5rem]"
      triggerClassName={cn(
        'flex items-center gap-3 rounded-xl text-left transition-colors',
        variant === 'sidebar' && 'w-full px-2 py-2 hover:bg-sidebar-accent',
        variant === 'compact' && 'p-1 hover:bg-sidebar-accent',
        variant === 'appbar' && 'rounded-full p-0.5 hover:ring-2 hover:ring-border',
      )}
      trigger={
        <>
          <Avatar user={user} size={variant === 'appbar' ? 32 : 34} />
          {variant === 'sidebar' && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-sidebar-muted">{user.email}</span>
            </span>
          )}
        </>
      }
    >
      {(close) => (
        <>
          {variant !== 'sidebar' && (
            <>
              <div className="px-2.5 py-2 leading-tight">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <MenuSeparator />
            </>
          )}
          <Link href="/settings" onClick={close} className={menuItemClasses} role="menuitem">
            <Settings className="h-4 w-4 text-muted-foreground" /> Account settings
          </Link>
          <Link href="/settings/security" onClick={close} className={menuItemClasses} role="menuitem">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Security
          </Link>
          <button type="button" onClick={() => setTheme(isDark ? 'light' : 'dark')} className={menuItemClasses} role="menuitem">
            <Sun className="h-4 w-4 text-muted-foreground dark:hidden" />
            <Moon className="hidden h-4 w-4 text-muted-foreground dark:block" />
            <span className="dark:hidden">Dark mode</span>
            <span className="hidden dark:inline">Light mode</span>
          </button>
          <MenuSeparator />
          <button type="button" onClick={logout} disabled={signingOut} className={cn(menuItemClasses, 'text-destructive')} role="menuitem">
            <LogOut className="h-4 w-4" /> {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </>
      )}
    </Menu>
  );
}
