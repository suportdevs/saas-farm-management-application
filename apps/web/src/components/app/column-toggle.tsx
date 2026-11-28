'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Columns3 } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Menu } from '@/components/ui/menu';
import { useT } from '@/i18n/provider';
import type { ExportDoc, ExportSection, ExportTable } from '@/lib/table-export';
import { cn } from '@/lib/utils';

/*
 * Show / hide table columns.
 *
 *   <ColumnsProvider id="purchases">   ← wraps the toolbar and the table
 *     … <ColumnToggle /> … <ExportMenu /> …
 *     <table>…</table>
 *   </ColumnsProvider>
 *
 * The column list is read from the table's <th> texts, so a table needs no
 * extra setup. Header cells with no text (checkbox, actions) or with
 * `data-col-fixed` are never offered. Hidden columns are remembered per list
 * in this browser, and the Download menu inside the provider leaves them out.
 */

type Columns = {
  /** Header texts the viewer hid (as shown, i.e. translated). */
  hidden: Set<string>;
  /** Header texts of the table that can be hidden, in order. */
  labels: () => string[];
  toggle: (label: string) => void;
  showAll: () => void;
};

const ColumnsContext = createContext<Columns | null>(null);

/** The column state of the surrounding list, or null outside a ColumnsProvider. */
export const useColumns = () => useContext(ColumnsContext);

const storageKey = (id: string) => `herdsphere.columns.${id}`;

const readHidden = (id: string): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(id)) ?? '[]');
    return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

const saveHidden = (id: string, hidden: string[]) => {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(hidden));
  } catch {
    // Storage blocked (private window): the choice just isn't remembered.
  }
};

/** Header cells of the first table inside `root` that can be hidden, with their position. */
function headerCells(root: HTMLElement | null) {
  const cells = [...(root?.querySelectorAll('table thead tr:first-child > th') ?? [])] as HTMLElement[];
  return cells
    .map((th, index) => ({ index, label: th.dataset.colFixed !== undefined ? '' : (th.textContent ?? '').trim() }))
    .filter((c) => c.label);
}

export function ColumnsProvider({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [css, setCss] = useState('');

  // Load the saved choice after mount (localStorage isn't there on the server).
  useEffect(() => setHidden(readHidden(id)), [id]);

  // Hide the cells with CSS: nth-child of every row, for each hidden header.
  // Rebuilt when the table changes (paging, sorting, new rows, language).
  useEffect(() => {
    const build = () => {
      const rules = headerCells(root.current)
        .filter((c) => hidden.includes(c.label))
        .map((c) => `[data-columns="${id}"] table tr > :nth-child(${c.index + 1}):not([colspan]) { display: none; }`)
        .join('\n');
      setCss((old) => (old === rules ? old : rules));
    };
    build();
    if (!root.current) return;
    const observer = new MutationObserver(build);
    observer.observe(root.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [hidden, id]);

  const update = useCallback(
    (next: string[]) => {
      setHidden(next);
      saveHidden(id, next);
    },
    [id],
  );

  const value = useMemo<Columns>(
    () => ({
      hidden: new Set(hidden),
      labels: () => headerCells(root.current).map((c) => c.label),
      toggle: (label) => update(hidden.includes(label) ? hidden.filter((h) => h !== label) : [...hidden, label]),
      showAll: () => update([]),
    }),
    [hidden, update],
  );

  return (
    <ColumnsContext.Provider value={value}>
      {css && <style>{css}</style>}
      <div ref={root} data-columns={id} className={className}>
        {children}
      </div>
    </ColumnsContext.Provider>
  );
}

/** "Columns" button: tick or untick the columns to show. At least one stays visible. */
export function ColumnToggle() {
  const columns = useColumns();
  const t = useT();
  if (!columns) return null;
  const count = columns.hidden.size;

  return (
    <Menu
      label={t('Columns')}
      align="end"
      className="w-60 p-2"
      triggerClassName={cn(buttonClasses(count ? 'secondary' : 'outline', 'sm'))}
      trigger={
        <>
          <Columns3 className="h-3.5 w-3.5" /> {t('Columns')}
          {count > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{count}</span>}
        </>
      }
    >
      {() => {
        const labels = columns.labels();
        const shown = labels.filter((l) => !columns.hidden.has(l)).length;
        return (
          <div className="space-y-1 text-sm">
            <p className="px-2 pb-1 text-xs text-muted-foreground">{t('Hidden columns are left out of downloads too.')}</p>
            <div className="max-h-72 overflow-auto">
              {labels.map((label) => {
                const visible = !columns.hidden.has(label);
                return (
                  <label key={label} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                    <Checkbox checked={visible} disabled={visible && shown === 1} onChange={() => columns.toggle(label)} />
                    <span className="truncate">{label}</span>
                  </label>
                );
              })}
            </div>
            {count > 0 && (
              <button type="button" onClick={columns.showAll} className="w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-primary hover:bg-muted">
                {t('Show all columns')}
              </button>
            )}
          </div>
        );
      }}
    </Menu>
  );
}

/**
 * Drops hidden columns from a download. Headers are matched by the text the
 * table header shows (English or translated).
 */
export function withoutHiddenColumns<T extends ExportTable | ExportDoc>(table: T, hidden: Set<string>, t: (text: string) => string): T {
  if (!hidden.size) return table;
  const trim = <S extends ExportSection>(section: S): S => {
    // English pages (admin) show the header as is; farm pages show it translated.
    const isHidden = (header: string) => hidden.has(header.trim()) || hidden.has(t(header).trim());
    const keep = section.headers.map((h, i) => (isHidden(section.labels?.[i] ?? h) ? -1 : i)).filter((i) => i >= 0);
    if (keep.length === section.headers.length || keep.length === 0) return section;
    return { ...section, headers: keep.map((i) => section.headers[i]!), labels: section.labels && keep.map((i) => section.labels![i]!), rows: section.rows.map((row) => keep.map((i) => row[i])) };
  };
  return 'sections' in table ? { ...table, sections: table.sections.map(trim) } : trim(table as ExportTable) as T;
}
