import { Building2, FileText, History, LayoutDashboard, Layers, Receipt, Server, ShieldCheck, Tractor, Users } from 'lucide-react';
import type { PlatformPermission } from '@kit/shared';
import type { NavLink, NavSection } from '@/modules/farms/navigation';

/** A platform admin link: shown only to staff whose role has `permission`. */
export interface PlatformNavLink extends Omit<NavLink, 'permission' | 'module'> {
  permission: PlatformPermission;
}

export interface PlatformNavSection {
  title?: string;
  links: PlatformNavLink[];
}

/** The platform admin menu (pages under /admin), grouped for the sidebar. */
export const PLATFORM_NAV: PlatformNavSection[] = [
  {
    links: [{ href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true, permission: 'platform.stats.view' }],
  },
  {
    title: 'Customers',
    links: [
      { href: '/admin/organizations', label: 'Clients', icon: Building2, permission: 'platform.tenants.view' },
      { href: '/admin/farms', label: 'Tenants', icon: Tractor, permission: 'platform.tenants.view' },
      { href: '/admin/users', label: 'Users', icon: Users, permission: 'platform.users.view' },
    ],
  },
  {
    title: 'Billing',
    links: [
      { href: '/admin/subscriptions', label: 'Subscriptions', icon: Layers, permission: 'platform.billing.view' },
      { href: '/admin/invoices', label: 'Invoices', icon: Receipt, permission: 'platform.billing.view' },
      { href: '/admin/plans', label: 'Plans', icon: FileText, permission: 'platform.billing.view' },
    ],
  },
  {
    title: 'Administration',
    links: [
      { href: '/admin/staff-roles', label: 'Staff roles', icon: ShieldCheck, permission: 'platform.staff.manage' },
      { href: '/admin/audit-logs', label: 'Audit log', icon: History, permission: 'platform.audit.view' },
      { href: '/admin/system', label: 'System', icon: Server, permission: 'platform.stats.view' },
    ],
  },
];

/** Only the sections and links the viewer's staff role can open, ready for the sidebar. */
export function platformNav(permissions: PlatformPermission[]): NavSection[] {
  return PLATFORM_NAV.map((section) => ({
    title: section.title,
    links: section.links.filter((l) => permissions.includes(l.permission)).map(({ permission: _permission, ...link }) => link),
  })).filter((s) => s.links.length);
}
