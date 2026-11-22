import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * A list card that fits the screen: the search / filter bar (`toolbar`) and the
 * table header stay in place while only the rows scroll. Put a plain <table>
 * (with a <thead>) or an empty state inside.
 */
export function TableFrame({ toolbar, children, className }: { toolbar?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('flex max-h-[calc(100dvh-6rem)] flex-col overflow-visible lg:max-h-[calc(100dvh-14rem)]', className)}>
      {toolbar && <div className="shrink-0 rounded-t-[inherit] border-b bg-muted/30 px-4 py-2.5">{toolbar}</div>}
      <div className="min-h-0 flex-1 overflow-auto [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-muted [&_thead]:shadow-[0_1px_0_var(--color-border)]">
        {children}
      </div>
    </Card>
  );
}
