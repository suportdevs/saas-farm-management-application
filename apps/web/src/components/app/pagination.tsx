'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination as PaginationInfo } from '@kit/shared';
import { buttonClasses } from '@/components/ui/button';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/utils';

/** Page numbers to show: first, last, and two around the current one ("…" = gap). */
function pageWindow(page: number, pages: number): (number | '…')[] {
  const out: (number | '…')[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== '…') out.push('…');
  }
  return out;
}

/**
 * "Showing 1–25 of 80" with Previous / page numbers / Next.
 *
 * - Server lists pass `basePath` + `params`: each page is a link that keeps the
 *   current query string (filters, pageSize).
 * - In-page (client) lists pass `onPage` instead.
 */
export function Pagination({
  pagination,
  basePath = '',
  params = {},
  onPage,
  className,
}: {
  pagination: PaginationInfo;
  basePath?: string;
  params?: Record<string, string | undefined>;
  onPage?: (page: number) => void;
  className?: string;
}) {
  const t = useT();
  const { page, pageSize, total } = pagination;
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== 'page') qs.set(k, v);
    qs.set('page', String(p));
    return `${basePath}?${qs}`;
  };

  const item = (p: number, label: ReactNode, opts: { active?: boolean; ariaLabel?: string } = {}) => {
    const cls = cn(buttonClasses(opts.active ? 'primary' : 'outline', 'sm'), 'min-w-8 px-2');
    if (opts.active) return <span key={`p${p}`} aria-current="page" className={cls}>{label}</span>;
    return onPage ? (
      <button key={`${p}-${String(opts.ariaLabel)}`} type="button" className={cls} onClick={() => onPage(p)} aria-label={opts.ariaLabel}>
        {label}
      </button>
    ) : (
      <Link key={`${p}-${String(opts.ariaLabel)}`} href={link(p)} className={cls} aria-label={opts.ariaLabel}>
        {label}
      </Link>
    );
  };

  return (
    <div className={cn('mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground', className)}>
      <span>
        {t('Showing {from}–{to} of {total}', {
          from: ((page - 1) * pageSize + 1).toLocaleString(),
          to: Math.min(page * pageSize, total).toLocaleString(),
          total: total.toLocaleString(),
        })}
      </span>
      {pages > 1 && (
        <nav aria-label={t('Pagination')} className="flex flex-wrap items-center gap-1">
          {page > 1 && item(page - 1, <ChevronLeft className="h-4 w-4" />, { ariaLabel: t('Previous page') })}
          {pageWindow(page, pages).map((p, i) =>
            p === '…' ? (
              <span key={`gap${i}`} className="px-1">
                …
              </span>
            ) : (
              item(p, p, { active: p === page })
            ),
          )}
          {page < pages && item(page + 1, <ChevronRight className="h-4 w-4" />, { ariaLabel: t('Next page') })}
        </nav>
      )}
    </div>
  );
}
