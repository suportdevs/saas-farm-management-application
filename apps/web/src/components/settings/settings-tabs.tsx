'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { settingsTabs } from '@/modules/registry';

const tabs = [
  { href: '/settings', label: 'Profile' },
  { href: '/settings/security', label: 'Security' },
  ...settingsTabs,
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            '-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            pathname === t.href ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
