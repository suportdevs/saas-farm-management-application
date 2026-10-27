import { Building2, FileText, History, LayoutDashboard, Layers, Receipt, Server, ShieldCheck, Tractor, Users } from 'lucide-react';
import type { PlatformPermission } from '@kit/shared';
import type { NavLink, NavSection } from '@/modules/farms/navigation';

/** A platform admin link: shown only to staff whose role has `permission`. */
export interface PlatformNavLink extends Omit<NavLink, 'permission' | 'module'> {
  permission: PlatformPermission;
  /** Shown under the page title and in the command palette. */
  description: string;
}

export interface PlatformNavSection {
  title?: string;
  links: PlatformNavLink[];
}

/** The platform admin menu (pages under /admin), grouped for the sidebar. */
export const PLATFORM_NAV: PlatformNavSection[] = [
  {
    links: [
      {
        href: '/admin',
        label: 'Overview',
        icon: LayoutDashboard,
        exact: true,
        permission: 'platform.stats.view',
        description: 'Revenue, growth and what needs your attention today.',
      },
    ],
  },
  {
    title: 'Customers',
    links: [
      { href: '/admin/organizations', label: 'Clients', icon: Building2, permission: 'platform.tenants.view', description: 'Client organizations and the farms they own.' },
      { href: '/admin/farms', label: 'Tenants', icon: Tractor, permission: 'platform.tenants.view', description: 'Every farm on the platform, its plan, owner and team.' },
      { href: '/admin/users', label: 'Users', icon: Users, permission: 'platform.users.view', description: 'Accounts, verification, suspensions and sessions.' },
    ],
  },
  {
    title: 'Billing',
    links: [
      { href: '/admin/subscriptions', label: 'Subscriptions', icon: Layers, permission: 'platform.billing.view', description: 'Plans, trials, deals and unpaid balances per tenant.' },
      { href: '/admin/invoices', label: 'Invoices', icon: Receipt, permission: 'platform.billing.view', description: 'Manual invoices and the payments recorded against them.' },
      { href: '/admin/plans', label: 'Plans', icon: FileText, permission: 'platform.billing.view', description: 'Subscription plans, prices, limits and modules.' },
    ],
  },
  {
    title: 'Administration',
    links: [
      { href: '/admin/staff-roles', label: 'Staff roles', icon: ShieldCheck, permission: 'platform.staff.manage', description: 'What each platform staff role is allowed to do.' },
      { href: '/admin/audit-logs', label: 'Audit log', icon: History, permission: 'platform.audit.view', description: 'Security and admin activity across the platform.' },
      { href: '/admin/system', label: 'System', icon: Server, permission: 'platform.stats.view', description: 'Runtime, database, email, billing and job status.' },
    ],
  },
];

/** The links the viewer's staff role can open, in menu order. */
export const allowedPlatformLinks = (permissions: PlatformPermission[]) =>
  PLATFORM_NAV.flatMap((s) => s.links.map((link) => ({ ...link, section: s.title }))).filter((l) => permissions.includes(l.permission));

/** Only the sections and links the viewer's staff role can open, ready for the sidebar. */
export function platformNav(permissions: PlatformPermission[]): NavSection[] {
  return PLATFORM_NAV.map((section) => ({
    title: section.title,
    links: section.links.filter((l) => permissions.includes(l.permission)).map(({ permission: _permission, description: _description, ...link }) => link),
  })).filter((s) => s.links.length);
}

/**
 * The menu entry for a URL, for the page header and breadcrumbs.
 * `detail` is true on pages below it, e.g. /admin/farms/<id> under Tenants.
 */
export function findPlatformPage(pathname: string) {
  for (const section of PLATFORM_NAV) {
    for (const link of section.links) {
      if (pathname === link.href) return { section: section.title, link, detail: false };
      if (!link.exact && pathname.startsWith(`${link.href}/`)) return { section: section.title, link, detail: true };
    }
  }
  return null;
}
