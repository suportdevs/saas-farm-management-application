'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PlatformPermission } from '@kit/shared';
import { cn } from '@/lib/utils';

const tabs: { href: string; label: string; exact?: boolean; permission: PlatformPermission }[] = [
  { href: '/admin', label: 'Overview', exact: true, permission: 'platform.stats.view' },
  { href: '/admin/farms', label: 'Tenants', permission: 'platform.tenants.view' },
  { href: '/admin/subscriptions', label: 'Subscriptions', permission: 'platform.billing.view' },
  { href: '/admin/invoices', label: 'Invoices', permission: 'platform.billing.view' },
  { href: '/admin/users', label: 'Users', permission: 'platform.users.view' },
  { href: '/admin/audit-logs', label: 'Audit log', permission: 'platform.audit.view' },
  { href: '/admin/staff-roles', label: 'Staff roles', permission: 'platform.staff.manage' },
];

/** Only the tabs the viewer's staff role can open. */
export function AdminTabs({ permissions }: { permissions: PlatformPermission[] }) {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b">
      {tabs.filter((t) => permissions.includes(t.permission)).map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
