'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search, Tractor, Users, type LucideIcon } from 'lucide-react';
import type { PlatformPermission } from '@kit/shared';
import { cn } from '@/lib/utils';
import { allowedPlatformLinks } from '../navigation';

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  href: string;
}

/**
 * Ctrl/⌘ + K quick search for platform staff: jump to any admin page, or
 * search tenants and users for the typed text (opens their filtered lists).
 */
export function CommandPalette({ open, onClose, permissions }: { open: boolean; onClose: () => void; permissions: PlatformPermission[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      setQuery('');
      setSelected(0);
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open]);

  const commands = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages: Command[] = allowedPlatformLinks(permissions)
      .filter((l) => !q || `${l.label} ${l.section ?? ''} ${l.description}`.toLowerCase().includes(q))
      .map((l) => ({ id: l.href, label: l.label, hint: l.section, group: 'Pages', icon: l.icon, href: l.href }));
    const searches: Command[] = [];
    if (q) {
      const text = encodeURIComponent(query.trim());
      if (permissions.includes('platform.tenants.view')) {
        searches.push({ id: 'search-farms', label: `Search tenants for “${query.trim()}”`, group: 'Search', icon: Tractor, href: `/admin/farms?q=${text}` });
      }
      if (permissions.includes('platform.users.view')) {
        searches.push({ id: 'search-users', label: `Search users for “${query.trim()}”`, group: 'Search', icon: Users, href: `/admin/users?q=${text}` });
      }
    }
    return [...pages, ...searches];
  }, [query, permissions]);

  const go = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    router.push(command.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, commands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(commands[selected]);
    }
  };

  let lastGroup = '';
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-label="Quick search"
      className="m-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 border-b px-4">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search pages, tenants or users…"
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Search"
        />
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Esc</kbd>
      </div>
      <ul className="max-h-80 overflow-y-auto p-2" role="listbox">
        {commands.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</li>}
        {commands.map((c, i) => {
          const heading = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          const Icon = c.icon;
          return (
            <li key={c.id}>
              {heading && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{heading}</p>}
              <button
                type="button"
                role="option"
                aria-selected={i === selected}
                onMouseEnter={() => setSelected(i)}
                onClick={() => go(c)}
                className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm', i === selected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground')}
              >
                <Icon className={cn('h-4 w-4 shrink-0', i === selected && 'text-primary')} />
                <span className="flex-1 truncate font-medium">{c.label}</span>
                {c.hint && <span className="text-xs text-muted-foreground">{c.hint}</span>}
                {i === selected && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-4 border-t bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
        <span>↑↓ to move</span>
        <span>Enter to open</span>
        <span>Esc to close</span>
      </div>
    </dialog>
  );
}
