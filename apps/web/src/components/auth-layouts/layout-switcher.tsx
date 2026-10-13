'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AUTH_LAYOUT_COOKIE, AUTH_LAYOUTS, type AuthLayout } from './layouts';

const label = (l: string) => l.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Floating picker to preview every auth layout (development / demo only). */
export function LayoutSwitcher({ current }: { current: AuthLayout }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const choose = (layout: AuthLayout) => {
    document.cookie = `${AUTH_LAYOUT_COOKIE}=${layout}; path=/; max-age=31536000; samesite=lax`;
    setOpen(false);
    router.refresh();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 text-sm">
      {open && (
        <div className="mb-2 w-52 overflow-hidden rounded-xl border bg-card/95 p-1 shadow-xl backdrop-blur" role="menu">
          <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Auth layout</p>
          {AUTH_LAYOUTS.map((l) => (
            <button
              key={l}
              role="menuitemradio"
              aria-checked={l === current}
              onClick={() => choose(l)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left hover:bg-muted',
                l === current && 'bg-primary/10 font-medium text-primary',
              )}
            >
              {label(l)}
              {l === current && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="ml-auto flex items-center gap-2 rounded-full border bg-card/95 px-4 py-2 font-medium shadow-lg backdrop-blur hover:bg-muted"
        aria-expanded={open}
      >
        <LayoutTemplate className="h-4 w-4 text-primary" /> {label(current)}
      </button>
    </div>
  );
}
