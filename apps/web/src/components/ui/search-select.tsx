'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SearchSelectProps {
  id?: string;
  /** Selected value; '' means none. */
  value: string;
  onChange: (value: string, option: SelectOption | null) => void;
  /** Static choices, filtered as you type… */
  options?: readonly SelectOption[];
  /** …or choices fetched as you type (debounced). */
  loadOptions?: (query: string) => Promise<SelectOption[]>;
  /** Label of the current value when it isn't in `options` (async selects). */
  selectedLabel?: string;
  placeholder?: string;
  clearable?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Searchable single select (select2-style): a button that opens a panel with
 * a search box and a keyboard-navigable list.
 */
export function SearchSelect({
  id,
  value,
  onChange,
  options,
  loadOptions,
  selectedLabel,
  placeholder = 'Select…',
  clearable,
  invalid,
  disabled,
  className,
  'aria-label': ariaLabel,
}: SearchSelectProps) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const choices = loadOptions
    ? loaded
    : (options ?? []).filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));
  const label = options?.find((o) => o.value === value)?.label ?? selectedLabel;

  // Async: fetch on open and as the query changes.
  useEffect(() => {
    if (!open || !loadOptions) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(
      () =>
        loadOptions(query.trim())
          .then((result) => !cancelled && setLoaded(result))
          .catch(() => !cancelled && setLoaded([]))
          .finally(() => !cancelled && setLoading(false)),
      query ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query, loadOptions]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => setActive(0), [query, loaded]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const pick = (option: SelectOption) => {
    onChange(option.value, option);
    close();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => Math.min(Math.max(i + step, 0), Math.max(choices.length - 1, 0)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (choices[active]) pick(choices[active]);
    } else if (e.key === 'Escape') {
      // Keep the surrounding dialog open.
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm shadow-xs transition-colors',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:border-primary',
          'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
          open && 'border-primary ring-4 ring-ring',
        )}
      >
        <span
          className={cn(
            'flex-1 truncate',
            !value && 'text-muted-foreground',
            clearable && value && 'pr-6',
          )}
        >
          {value ? (label ?? '…') : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {clearable && value && !disabled && (
        <button
          type="button"
          aria-label="Clear"
          onClick={() => onChange('', null)}
          className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {open && (
        <div className="absolute z-50 mt-1.5 w-full min-w-56 animate-fade-up rounded-xl border bg-card p-1.5 shadow-xl [animation-duration:120ms]">
          <div className="relative mb-1.5">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search…"
              aria-label="Search options"
              aria-controls={listId}
              aria-activedescendant={choices[active] ? `${listId}-${active}` : undefined}
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm focus-visible:outline-none focus-visible:border-primary"
            />
          </div>
          <ul id={listId} role="listbox" className="max-h-60 overflow-y-auto">
            {loading && !choices.length ? (
              <li className="flex items-center gap-2 px-2.5 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </li>
            ) : !choices.length ? (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">No results</li>
            ) : (
              choices.map((o, i) => (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm',
                    i === active && 'bg-muted',
                  )}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.value === value && <Check className="h-4 w-4 text-primary" />}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
