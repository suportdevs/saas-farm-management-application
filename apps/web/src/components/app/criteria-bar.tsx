import type { ReactNode } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

/** One applied search or filter. Removed through a link (server pages) or a click (client lists). */
export type Criterion = { key: string; label: string; value: ReactNode; href?: string; onRemove?: () => void };

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
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="font-medium text-muted-foreground">Criteria:</span>
      {items.length === 0 ? (
        <span className="text-muted-foreground">None — showing all {total.toLocaleString()} rows</span>
      ) : (
        <>
          {items.map((c) => (
            <span key={c.key} className={CHIP}>
              <span className="text-muted-foreground">{c.label}:</span>
              <span className="font-medium">{c.value}</span>
              {c.href ? (
                <Link href={c.href} className={REMOVE} aria-label={`Remove ${c.label} filter`}>
                  <X className="h-3 w-3" />
                </Link>
              ) : (
                <button type="button" onClick={c.onRemove} className={REMOVE} aria-label={`Remove ${c.label} filter`}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {clearHref ? (
            <Link href={clearHref} className="ml-1 text-primary hover:underline">
              Clear all
            </Link>
          ) : (
            <button type="button" onClick={onClear} className="ml-1 text-primary hover:underline">
              Clear all
            </button>
          )}
          <span className="ml-auto text-muted-foreground">{total.toLocaleString()} matching</span>
        </>
      )}
    </div>
  );
}

/**
 * Builds criteria for a server list page from its URL params: each entry
 * `[label, value, ...paramKeys]` becomes a chip whose × links to the same
 * page without those params (and back to page 1). Empty values are skipped.
 */
export function urlCriteria(
  basePath: string,
  params: Record<string, string | undefined>,
  entries: [label: string, value: ReactNode, ...keys: string[]][],
  /** Params kept by "Clear all" too, e.g. the rows-per-page choice. */
  keep: string[] = ['pageSize'],
) {
  const href = (drop: string[]) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && k !== 'page' && !drop.includes(k)) as [string, string][]);
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const items: Criterion[] = entries
    .filter(([, , ...keys]) => keys.some((k) => params[k]))
    .map(([label, value, ...keys]) => ({ key: keys[0]!, label, value, href: href(keys) }));
  const filterKeys = Object.keys(params).filter((k) => !keep.includes(k));
  return { items, clearHref: href(filterKeys) };
}

/** Criteria as plain text for a download header, e.g. [{ label: 'Status', value: 'Active' }]. */
export const exportCriteria = (items: Criterion[]) =>
  items.map((c) => ({
    label: c.label,
    // Flag emoji (🇳🇿) can't be drawn by the PDF font, so they are dropped.
    value: (typeof c.value === 'string' ? c.value : String(c.value ?? '')).replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '').trim(),
  }));
