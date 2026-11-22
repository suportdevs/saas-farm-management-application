import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Page title row. `compact` (list pages) shows the eyebrow as a small
 * breadcrumb ("Herd › Batches") and keeps the title and description on one
 * short line, so the table gets most of the screen.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  compact = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 lg:flex-nowrap">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="font-medium text-primary">{eyebrow}</span>
              <ChevronRight className="h-3 w-3" />
              <span>{title}</span>
            </nav>
          )}
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="shrink-0 text-xl font-bold tracking-tight">{title}</h1>
            {description && (
              <p className="hidden min-w-0 truncate text-sm text-muted-foreground md:block" title={typeof description === 'string' ? description : undefined}>
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    );
  }

  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-sm font-medium text-primary">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
