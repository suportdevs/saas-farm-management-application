'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { usePreferences } from '@/components/shell/preferences-provider';
import { PAGE_SIZES } from '@/lib/preferences';
import { useT } from '@/i18n/provider';

/**
 * "Rows [25 ▾]" — used on every list.
 *
 * - Server lists: leave out `value`/`onChange`; it writes `?pageSize=` to the
 *   URL (and goes back to page 1).
 * - In-page lists: pass `value` and `onChange` (see `useLocalPages`).
 *
 * The default comes from Site settings → Rows per page.
 */
export function PageSizeSelect({ value, onChange }: { value?: number; onChange?: (size: number) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { prefs } = usePreferences();
  const t = useT();
  const [, startTransition] = useTransition();
  const current = value ?? (Number(params.get('pageSize')) || prefs.pageSize);

  const change = (size: number) => {
    if (onChange) return onChange(size);
    const next = new URLSearchParams(params);
    next.set('pageSize', String(size));
    next.delete('page');
    startTransition(() => router.replace(`${pathname}?${next}`));
  };

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {t('Rows')}
      <select
        value={current}
        onChange={(e) => change(Number(e.target.value))}
        className="h-8 rounded-lg border border-input bg-card px-2 text-xs text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
        aria-label={t('Rows per page')}
      >
        {PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Paging for lists already loaded in the browser (roles, plans, …):
 * `const pager = useLocalPages(visibleRows)` then render `pager.rows` and
 * `<Pagination pagination={pager.pagination} onPage={pager.setPage} />`.
 */
export function useLocalPages<T>(rows: T[]) {
  const { prefs } = usePreferences();
  const [pageSize, setPageSizeState] = useState(prefs.pageSize);
  const [wanted, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  // A search that shrinks the list never leaves you on an empty page.
  const page = Math.min(wanted, pages);
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total: rows.length },
    pageSize,
    setPage,
    setPageSize: (size: number) => {
      setPageSizeState(size);
      setPage(1);
    },
  };
}
