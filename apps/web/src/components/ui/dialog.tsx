'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Modal built on the native <dialog> element: focus trapping, Escape to close
 * and the top layer come from the browser.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
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
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border bg-card p-0 text-foreground shadow-2xl',
        'backdrop:bg-black/40 backdrop:backdrop-blur-sm open:animate-fade-up',
        className,
      )}
    >
      {open && (
        <div>
          <div className="flex items-start justify-between gap-4 p-6 pb-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {children && <div className="px-6 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl border-t bg-muted/40 px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
