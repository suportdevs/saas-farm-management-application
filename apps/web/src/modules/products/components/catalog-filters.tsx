'use client';

import { useState, type FormEvent } from 'react';
import { filterColumns, STATUS_OPTIONS, type CatalogResource } from '@kit/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchSelect } from '@/components/ui/search-select';
import { CatalogSelect } from './catalog-select';

export type FilterValues = Record<string, string>;

/** URL parameters the filter panel owns (everything except `q` and `page`). */
export const filterParams = (resource: CatalogResource) => [
  ...filterColumns(resource).flatMap((c) =>
    c.input === 'number' ? [`${c.csv}Min`, `${c.csv}Max`] : [c.csv],
  ),
  'from',
  'to',
];

/**
 * Advanced filters: the definition's filter columns (reference, status,
 * number range) plus the created-date range. Applied through the URL.
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
    <form onSubmit={submit} className="border-b bg-muted/30 px-4 py-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {filterColumns(resource).map((c) => {
          const id = `filter-${c.csv}`;
          if (c.ref) {
            return (
              <Field key={c.csv} id={id} label={c.label}>
                <CatalogSelect
                  id={id}
                  resource={c.ref}
                  value={text(c.csv)}
                  onChange={(v) => set(c.csv, v)}
                  filters={c.dependsOn ? { [c.dependsOn]: draft[c.dependsOn] } : undefined}
                  placeholder={`Any ${c.label.toLowerCase()}`}
                  clearable
                />
              </Field>
            );
          }
          if (c.input === 'status') {
            return (
              <Field key={c.csv} id={id} label={c.label}>
                <SearchSelect
                  id={id}
                  options={STATUS_OPTIONS}
                  value={text(c.csv)}
                  onChange={(v) => set(c.csv, v)}
                  placeholder="Any status"
                  clearable
                />
              </Field>
            );
          }
          return (
            <Field key={c.csv} id={id} label={c.label}>
              <div className="flex items-center gap-2">
                <Input
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
        <Field id="filter-from" label="Created">
          <div className="flex items-center gap-2">
            <Input
              id="filter-from"
              type="date"
              value={text('from')}
              max={text('to') || undefined}
              onChange={(e) => set('from', e.target.value)}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="date"
              aria-label="Created until"
              value={text('to')}
              min={text('from') || undefined}
              onChange={(e) => set('to', e.target.value)}
            />
          </div>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={reset}>
          Reset
        </Button>
        <Button type="submit" size="sm">
          Apply filters
        </Button>
      </div>
    </form>
  );
}
