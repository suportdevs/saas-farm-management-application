'use client';

import Link from 'next/link';
import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { roleLabel, type FarmSummary } from '@kit/shared';
import { Menu, MenuLabel, MenuSeparator, menuItemClasses } from '@/components/ui/menu';
import { flag, initials } from '@/lib/format';
import { cn } from '@/lib/utils';

const TILE_COLORS = ['from-emerald-500 to-green-700', 'from-amber-400 to-orange-600', 'from-sky-500 to-blue-700', 'from-lime-500 to-emerald-700', 'from-rose-400 to-red-600', 'from-teal-400 to-cyan-700'];

export function FarmTile({ farm, className }: { farm: Pick<FarmSummary, 'id' | 'name'>; className?: string }) {
  const color = TILE_COLORS[[...farm.id].reduce((s, c) => s + c.charCodeAt(0), 0) % TILE_COLORS.length];
  return (
    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold text-white', color, className)}>
      {initials(farm.name)}
    </span>
  );
}

export function FarmSwitcher({
  farms,
  current,
  onNavigate,
  side = 'bottom',
}: {
  farms: FarmSummary[];
  current: FarmSummary | undefined;
  onNavigate?: () => void;
  /** Where the farm list opens; "top" when the switcher sits in a bottom menu bar. */
  side?: 'top' | 'bottom';
}) {
  if (!current) {
    return (
      <Link
        href="/onboarding"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-xl border border-dashed border-sidebar-border px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-accent">
          <Plus className="h-4 w-4" />
        </span>
        Create your farm
      </Link>
    );
  }
  return (
    <Menu
      label="Switch farm"
      side={side}
      className="w-[15.5rem]"
      triggerClassName="flex w-full items-center gap-3 rounded-xl bg-sidebar-accent/70 px-2.5 py-2 text-left ring-1 ring-sidebar-border transition-colors hover:bg-sidebar-accent"
      trigger={
        <>
          <FarmTile farm={current} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-sidebar-foreground">{current.name}</span>
            <span className="block truncate text-xs text-sidebar-muted">
              {flag(current.country)} {current.planName} · {roleLabel(current.role, current.customRole)}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-muted" />
        </>
      }
    >
      {(close) => (
        <>
          <MenuLabel>Your farms</MenuLabel>
          <div className="max-h-72 overflow-y-auto">
            {farms.map((farm) => (
              <Link
                key={farm.id}
                href={`/farms/${farm.slug}`}
                onClick={() => {
                  close();
                  onNavigate?.();
                }}
                className={menuItemClasses}
                role="menuitem"
              >
                <FarmTile farm={farm} className="h-7 w-7 text-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{farm.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {flag(farm.country)} {farm.organization.name} · {roleLabel(farm.role, farm.customRole)}
                    {farm.suspended && ' · Suspended'}
                  </span>
                </span>
                {farm.id === current.id && <Check className="h-4 w-4 text-primary" />}
              </Link>
            ))}
          </div>
          <MenuSeparator />
          <Link
            href={`/organizations/${current.organization.id}`}
            onClick={() => {
              close();
              onNavigate?.();
            }}
            className={menuItemClasses}
            role="menuitem"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate">{current.organization.name}</span>
          </Link>
          <Link
            href={`/onboarding?org=${current.organization.id}`}
            onClick={() => {
              close();
              onNavigate?.();
            }}
            className={menuItemClasses}
            role="menuitem"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed">
              <Plus className="h-4 w-4" />
            </span>
            Add another farm
          </Link>
        </>
      )}
    </Menu>
  );
}
