import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const tones = {
  green: 'bg-primary/10 text-primary',
  amber: 'bg-accent/20 text-amber-700 dark:text-accent',
  blue: 'bg-info/12 text-info',
  rose: 'bg-destructive/10 text-destructive',
} as const;

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'green',
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <div className={cn('group relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', tones[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
