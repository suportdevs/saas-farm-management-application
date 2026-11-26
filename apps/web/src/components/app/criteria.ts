import type { ReactNode } from 'react';

/** One applied search or filter. Removed through a link (server pages) or a click (client lists). */
export type Criterion = { key: string; label: string; value: ReactNode; href?: string; onRemove?: () => void };

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
