'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { catalogPath, filterColumns, STATUS_OPTIONS, type CatalogOption, type CatalogResource } from '@kit/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchSelect } from '@/components/ui/search-select';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useFarm } from '@/modules/farms/context';
import { CatalogSelect } from './catalog-select';

export type FilterValues = Record<string, string>;

/** Compact fields; a from–to range (date or number) gets two grid cells so its inputs fit. */
const fieldClass = (input?: string) => cn('space-y-1 [&_label]:text-xs [&_label]:text-muted-foreground', (input === 'date' || input === 'number') && 'sm:col-span-2');
/** Small inputs for the filter bar. */
const SMALL = 'h-8 px-2.5 text-xs';

/** URL parameters the filter panel owns (everything except `q` and `page`). */
export const filterParams = (resource: CatalogResource) => [
  ...filterColumns(resource).flatMap((c) =>
    c.input === 'number' ? [`${c.csv}Min`, `${c.csv}Max`] : c.input === 'date' ? [`${c.csv}From`, `${c.csv}To`] : [c.csv],
  ),
  'from',
  'to',
];

/**
 * Advanced filters: the definition's filter columns (reference, status,
 * select, number range, date range) plus the created-date range. Applied through the URL.
 */
export function CatalogFilters({
  resource,
  values,
  onApply,
}: {
  resource: CatalogResource;
  values: FilterValues;
  onApply: (values: FilterValues) => void;
}) {
  const [draft, setDraft] = useState<FilterValues>(values);
  // Changing a filter clears the ones that depend on it (category → product).
  const set = (key: string, value: string) =>
    setDraft((d) => {
      const next = { ...d, [key]: value };
      for (const c of filterColumns(resource)) if (c.dependsOn === key) next[c.csv] = '';
      return next;
    });
  const text = (key: string) => draft[key] ?? '';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onApply(draft);
  };
  const reset = () => {
    setDraft({});
    onApply({});
  };

  return (
    <form onSubmit={submit} className="border-b bg-muted/30 px-4 py-2.5">
      <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {filterColumns(resource).map((c) => {
          const id = `filter-${c.csv}`;
          if (c.ref) {
            return (
              <Field key={c.csv} id={id} label={c.label} className={fieldClass(c.input)}>
                <CatalogSelect
                  id={id}
                  resource={c.ref}
                  value={text(c.csv)}
                  onChange={(v) => set(c.csv, v)}
                  filters={c.dependsOn ? { [c.dependsOn]: draft[c.dependsOn] } : undefined}
                  placeholder={`Any ${c.label.toLowerCase()}`}
                  clearable
                  size="sm"
                />
              </Field>
            );
          }
          if (c.input === 'date') {
            return (
              <Field key={c.csv} id={id} label={c.label} className={fieldClass(c.input)}>
                <div className="flex items-center gap-2">
                  <Input
                    className={SMALL}
                    id={id}
                    type="date"
                    value={text(`${c.csv}From`)}
                    max={text(`${c.csv}To`) || undefined}
                    onChange={(e) => set(`${c.csv}From`, e.target.value)}
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    className={SMALL}
                    type="date"
                    aria-label={`${c.label} until`}
                    value={text(`${c.csv}To`)}
                    min={text(`${c.csv}From`) || undefined}
                    onChange={(e) => set(`${c.csv}To`, e.target.value)}
                  />
                </div>
              </Field>
            );
          }
          if (c.input === 'select') {
            return (
              <Field key={c.csv} id={id} label={c.label} className={fieldClass(c.input)}>
                <SearchSelect
                  id={id}
                  options={c.options!}
                  value={text(c.csv)}
                  onChange={(v) => set(c.csv, v)}
                  placeholder={`Any ${c.label.toLowerCase()}`}
                  clearable
                  size="sm"
                />
              </Field>
            );
          }
          if (c.input === 'status') {
            return (
              <Field key={c.csv} id={id} label={c.label} className={fieldClass(c.input)}>
                <SearchSelect
                  id={id}
                  options={STATUS_OPTIONS}
                  value={text(c.csv)}
                  onChange={(v) => set(c.csv, v)}
                  placeholder="Any status"
                  clearable
                  size="sm"
                />
              </Field>
            );
          }
          return (
            <Field key={c.csv} id={id} label={c.label} className={fieldClass(c.input)}>
              <div className="flex items-center gap-2">
                <Input
                    className={SMALL}
                  id={id}
                  type="number"
                  min={0}
                  step="any"
                  placeholder="Min"
                  value={text(`${c.csv}Min`)}
                  onChange={(e) => set(`${c.csv}Min`, e.target.value)}
                />
                <span className="text-muted-foreground">–</span>
                <Input
                    className={SMALL}
                  type="number"
                  min={0}
                  step="any"
                  placeholder="Max"
                  aria-label={`${c.label} max`}
                  value={text(`${c.csv}Max`)}
                  onChange={(e) => set(`${c.csv}Max`, e.target.value)}
                />
              </div>
            </Field>
          );
        })}
        <Field id="filter-from" label="Created" className={fieldClass('date')}>
          <div className="flex items-center gap-2">
            <Input
                    className={SMALL}
              id="filter-from"
              type="date"
              value={text('from')}
              max={text('to') || undefined}
              onChange={(e) => set('from', e.target.value)}
            />
            <span className="text-muted-foreground">–</span>
            <Input
                    className={SMALL}
              type="date"
              aria-label="Created until"
              value={text('to')}
              min={text('from') || undefined}
              onChange={(e) => set('to', e.target.value)}
            />
          </div>
        </Field>
        {/* Buttons sit in the grid, after the last field, to save a row. */}
        <div className="flex items-end justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            Reset
          </Button>
          <Button type="submit" size="sm" className="whitespace-nowrap">
            Apply filters
          </Button>
        </div>
      </div>
    </form>
  );
}

/** A reference filter's name (the URL only holds its key). */
function RefName({ resource, value }: { resource: CatalogResource; value: string }) {
  const { farm } = useFarm();
  const [name, setName] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ options: CatalogOption[] }>(`/farms/${farm.slug}/${catalogPath(resource)}/options?keys=${value}`)
      .then(({ options }) => !cancelled && setName(options[0]?.name))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [farm.slug, resource, value]);
  return <>{name ?? '…'}</>;
}

/** "2026-01-01 – 2026-02-01", "from 5", "up to 9". */
const range = (from?: string, to?: string) => (from && to ? `${from} – ${to}` : from ? `from ${from}` : `up to ${to}`);

/**
 * The search and filters in use, always shown above the table (also while
 * the filter panel is closed). Each chip has × to remove it.
 */
export function CatalogCriteria({
  resource,
  query,
  total,
  onRemove,
  onClear,
}: {
  resource: CatalogResource;
  query: FilterValues;
  total: number;
  /** URL parameters to drop, e.g. ['statusFrom', 'statusTo']. */
  onRemove: (keys: string[]) => void;
  onClear: () => void;
}) {
  const chips: { keys: string[]; label: string; value: ReactNode }[] = [];
  if (query.q) chips.push({ keys: ['q'], label: 'Search', value: `“${query.q}”` });
  for (const c of filterColumns(resource)) {
    if (c.input === 'date' || c.input === 'number') {
      const [a, b] = c.input === 'date' ? [`${c.csv}From`, `${c.csv}To`] : [`${c.csv}Min`, `${c.csv}Max`];
      if (query[a] || query[b]) chips.push({ keys: [a, b], label: c.label, value: range(query[a], query[b]) });
      continue;
    }
    const v = query[c.csv];
    if (!v) continue;
    const value = c.ref ? (
      <RefName resource={c.ref} value={v} />
    ) : c.input === 'status' ? (
      (STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v)
    ) : (
      (c.options?.find((o) => o.value === v)?.label ?? v)
    );
    chips.push({ keys: [c.csv], label: c.label, value });
  }
  if (query.from || query.to) chips.push({ keys: ['from', 'to'], label: 'Created', value: range(query.from, query.to) });

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-muted/20 px-4 py-1.5 text-xs">
      <span className="font-medium text-muted-foreground">Criteria:</span>
      {chips.length === 0 ? (
        <span className="text-muted-foreground">None — showing all {total} rows</span>
      ) : (
        <>
          {chips.map((chip) => (
            <span key={chip.keys[0]} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-2.5 pr-1 text-foreground">
              <span className="text-muted-foreground">{chip.label}:</span>
              <span className="font-medium">{chip.value}</span>
              <button
                type="button"
                onClick={() => onRemove(chip.keys)}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-primary/20 hover:text-foreground"
                aria-label={`Remove ${chip.label} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button type="button" onClick={onClear} className="ml-1 text-primary hover:underline">
            Clear all
          </button>
          <span className="ml-auto text-muted-foreground">{total} matching</span>
        </>
      )}
    </div>
  );
}
