'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronDown, LogOut, Moon, Settings, Shield, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { can, type FarmSummary, type PublicUser } from '@kit/shared';
import { Avatar } from '@/components/app/user-menu';
import { LogoBadge } from '@/components/logo';
import { Menu, MenuSeparator, menuItemClasses } from '@/components/ui/menu';
import { api } from '@/lib/api';
import { farmNav, type NavLink } from '@/modules/farms/navigation';
import { appName, cn } from '@/lib/utils';
import { moduleNavItems } from '@/modules/registry';
import { FarmSwitcher } from '@/modules/farms/components/farm-switcher';

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

export function SidebarContent({ user, farms, onNavigate }: ShellProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = useCurrentFarm(farms);
  const sections = current ? farmNav(current.slug) : [];
  const isActive = (link: NavLink) => (link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`));

  const accountLinks: NavLink[] = [
    // Items contributed by installed kit modules.
    ...moduleNavItems.map((item) => ({ ...item, icon: item.icon ?? Settings })),
    { href: '/settings', label: 'Account', icon: UserRound },
    ...(user.role === 'admin' ? [{ href: '/admin', label: 'Platform admin', icon: Shield }] : []),
  ];

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 px-5 pb-4 pt-5 font-semibold tracking-tight">
        <LogoBadge />
        <span className="text-[17px]">{appName}</span>
      </Link>

      <div className="px-3">
        <FarmSwitcher farms={farms} current={current} onNavigate={onNavigate} />
      </div>

      <nav className="scrollbar-sidebar mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Main">
        {sections.map((section, i) => {
          const links = section.links.filter((l) => !l.permission || (current && can(current.role, l.permission)));
          if (!links.length) return null;
          return (
            <div key={section.title ?? i}>
              {section.title && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted/80">{section.title}</p>}
              <ul className="space-y-0.5">
                {links.map((link) => (
                  <li key={link.href}>
                    {link.children ? (
                      <SidebarGroup link={link} pathname={pathname} onNavigate={onNavigate} />
                    ) : (
                      <SidebarLink link={link} active={isActive(link)} onNavigate={onNavigate} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <div>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted/80">You</p>
          <ul className="space-y-0.5">
            {accountLinks.map((link) => (
              <li key={link.href}>
                <SidebarLink link={link} active={isActive(link)} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <AccountMenu user={user} />
      </div>
    </div>
  );
}

function SidebarLink({ link, active, onNavigate }: { link: NavLink; active: boolean; onNavigate?: () => void }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-sidebar-accent text-white' : 'text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
      )}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-sidebar-primary" />}
      <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-sidebar-primary' : 'opacity-80 group-hover:opacity-100')} />
      <span className="flex-1 truncate">{link.label}</span>
      {link.soon && <span className="rounded-full bg-white/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">Soon</span>}
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
          inside ? 'text-white' : 'text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
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
                    active ? 'bg-sidebar-accent text-white' : 'text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
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

function AccountMenu({ user }: { user: PublicUser }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const logout = async () => {
    setSigningOut(true);
    await api.post('/auth/logout').catch(() => {});
    router.push('/login');
    router.refresh();
  };
  const toggleTheme = () => {
    const dark = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {}
  };
  return (
    <Menu
      label="Account menu"
      side="top"
      className="w-[15.5rem]"
      triggerClassName="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sidebar-accent"
      trigger={
        <>
          <Avatar user={user} size={34} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-sidebar-muted">{user.email}</span>
          </span>
        </>
      }
    >
      {(close) => (
        <>
          <Link href="/settings" onClick={close} className={menuItemClasses} role="menuitem">
            <Settings className="h-4 w-4 text-muted-foreground" /> Account settings
          </Link>
          <Link href="/settings/security" onClick={close} className={menuItemClasses} role="menuitem">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Security
          </Link>
          <button type="button" onClick={toggleTheme} className={menuItemClasses} role="menuitem">
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
