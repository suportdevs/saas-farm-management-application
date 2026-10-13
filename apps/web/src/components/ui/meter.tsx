import { cn } from '@/lib/utils';

/** Usage meter: "12 of 25 animals". `max === null` means unlimited. */
export function Meter({ label, value, max, className }: { label: string; value: number; max: number | null; className?: string }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const tone = max === null ? 'bg-primary/25' : pct >= 100 ? 'bg-destructive' : pct >= 80 ? 'bg-warning' : 'bg-primary';
  const width = max === null ? 100 : Math.max(pct, value ? 3 : 0);
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value.toLocaleString()} {max === null ? '· Unlimited' : `of ${max.toLocaleString()}`}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max ?? undefined}
      >
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
