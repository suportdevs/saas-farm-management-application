'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronDown, Lock, Shield } from 'lucide-react';
import { Menu, menuItemClasses } from '@/components/ui/menu';
import { cn } from '@/lib/utils';
import { FarmSwitcher } from '@/modules/farms/components/farm-switcher';
import type { NavLink } from '@/modules/farms/navigation';
import { useNavSections, type ShellProps } from './app-sidebar';

/**
 * The app menu as a horizontal bar (menu position "top" or "bottom", large screens).
 * Same sections as the sidebar: untitled ones show their links, titled ones open a dropdown.
 */
export function HorizontalNav({ user, farms, position }: ShellProps & { position: 'top' | 'bottom' }) {
  const { current, inPlatform, sections, isActive } = useNavSections({ user, farms });
  // Dropdowns open away from the screen edge.
  const side = position === 'bottom' ? 'top' : 'bottom';

  return (
    <nav aria-label="Main" className={cn('bg-sidebar text-sidebar-foreground', position === 'top' ? 'border-b border-sidebar-border' : 'border-t border-sidebar-border')}>
      <div className="flex h-14 items-center gap-3 px-4">
        <div className="w-60 shrink-0">
          {inPlatform ? (
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary/20 text-sidebar-primary">
                <Shield className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold">Platform admin</span>
              <Link
                href={current ? `/farms/${current.slug}` : '/dashboard'}
                className="ml-auto rounded-md p-1.5 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                title="Back to farm"
                aria-label="Back to farm"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <FarmSwitcher farms={farms} current={current} side={side} />
          )}
        </div>

        <ul className="flex flex-1 flex-wrap items-center gap-1">
          {sections.map((section, i) =>
            section.title ? (
              <li key={section.title}>
                <SectionMenu title={section.title} links={section.links} side={side} isActive={isActive} />
              </li>
            ) : (
              section.links.map((link) => (
                <li key={`${i}-${link.href}`}>
                  <Link
                    href={link.href}
                    aria-current={isActive(link) ? 'page' : undefined}
                    className={cn(itemClasses, isActive(link) ? activeClasses : idleClasses)}
                  >
                    <link.icon className="h-4 w-4" /> {link.label}
                  </Link>
                </li>
              ))
            ),
          )}
        </ul>
      </div>
    </nav>
  );
}

const itemClasses = 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors';
const activeClasses = 'bg-sidebar-accent text-sidebar-active';
const idleClasses = 'text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground';

function SectionMenu({
  title,
  links,
  side,
  isActive,
}: {
  title: string;
  links: NavLink[];
  side: 'top' | 'bottom';
  isActive: (link: Pick<NavLink, 'href' | 'exact'>) => boolean;
}) {
  const active = links.some((l) => isActive(l) || l.children?.some((c) => isActive(c)));
  return (
    <Menu
      label={title}
      side={side}
      triggerClassName={cn(itemClasses, active ? activeClasses : idleClasses)}
      trigger={
        <>
          {title} <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </>
      }
    >
      {(close) =>
        links.map((link) => (
          <div key={link.href}>
            <Link href={link.href} onClick={close} className={cn(menuItemClasses, isActive(link) && 'bg-muted font-medium')} role="menuitem">
              <link.icon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">{link.label}</span>
              {link.locked ? (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Upgrade to unlock" />
              ) : (
                link.soon && <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold uppercase text-muted-foreground">Soon</span>
              )}
            </Link>
            {link.children?.map((child) => (
              <Link key={child.href} href={child.href} onClick={close} className={cn(menuItemClasses, 'py-1.5 pl-9 text-[13px]', isActive(child) && 'bg-muted font-medium')} role="menuitem">
                {child.label}
              </Link>
            ))}
          </div>
        ))
      }
    </Menu>
  );
}
