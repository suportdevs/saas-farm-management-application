'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const sides = {
  right: 'ml-auto h-dvh max-h-none w-full max-w-sm border-l',
  left: 'mr-auto h-dvh max-h-none w-full max-w-sm border-r',
  top: 'mb-auto w-full max-w-none border-b',
  bottom: 'mt-auto w-full max-w-none border-t',
} as const;

/**
 * Off-canvas panel that slides in from an edge. Built on <dialog> like
 * Dialog: focus trapping, Escape to close and the backdrop come from the browser.
 */
export function Sheet({
  open,
  onClose,
  side = 'right',
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  side?: keyof typeof sides;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={cn('m-0 bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]', sides[side], className)}
    >
      {/* Only mount the content while open, so it starts fresh each time. */}
      {open && (
        <div className="flex h-full max-h-dvh flex-col">
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="border-t px-5 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
