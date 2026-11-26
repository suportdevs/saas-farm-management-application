'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useT } from '@/i18n/provider';

import type { Criterion } from './criteria';

export type { Criterion } from './criteria';

const CHIP = 'inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-2.5 pr-1 text-foreground';
const REMOVE = 'rounded-full p-0.5 text-muted-foreground hover:bg-primary/20 hover:text-foreground';

/**
 * "Criteria: Search: “x” ×  Status: Active ×  Clear all" — the search and
 * filters in use, shown above a table even while the filter fields are
 * collapsed. With nothing applied it says so.
 */
export function CriteriaBar({
  items,
  total,
  clearHref,
  onClear,
}: {
  items: Criterion[];
  total: number;
  clearHref?: string;
  onClear?: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="font-medium text-muted-foreground">{t('Criteria:')}</span>
      {items.length === 0 ? (
        <span className="text-muted-foreground">{t('None — showing all {total} rows', { total: total.toLocaleString() })}</span>
      ) : (
        <>
          {items.map((c) => (
            <span key={c.key} className={CHIP}>
              <span className="text-muted-foreground">{t(c.label)}:</span>
              {/* Choice labels (Active, Pending…) translate; typed searches stay as typed. */}
              <span className="font-medium">{typeof c.value === 'string' ? t(c.value) : c.value}</span>
              {c.href ? (
                <Link href={c.href} className={REMOVE} aria-label={t('Remove {name} filter', { name: t(c.label) })}>
                  <X className="h-3 w-3" />
                </Link>
              ) : (
                <button type="button" onClick={c.onRemove} className={REMOVE} aria-label={t('Remove {name} filter', { name: t(c.label) })}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {clearHref ? (
            <Link href={clearHref} className="ml-1 text-primary hover:underline">
              {t('Clear all')}
            </Link>
          ) : (
            <button type="button" onClick={onClear} className="ml-1 text-primary hover:underline">
              {t('Clear all')}
            </button>
          )}
          <span className="ml-auto text-muted-foreground">{t('{total} matching', { total: total.toLocaleString() })}</span>
        </>
      )}
    </div>
  );
}

