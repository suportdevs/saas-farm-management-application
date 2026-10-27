import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Per tone: the gradient icon tile and the soft halo in the corner. */
const tones = {
  // Follows the chosen color palette.
  green: { tile: 'from-sidebar-primary to-primary shadow-primary/30', halo: 'bg-primary/25' },
  amber: { tile: 'from-amber-300 to-orange-500 shadow-orange-500/30', halo: 'bg-amber-400/25' },
  blue: { tile: 'from-sky-400 to-blue-600 shadow-blue-500/30', halo: 'bg-sky-400/25' },
  rose: { tile: 'from-rose-400 to-red-600 shadow-red-500/30', halo: 'bg-rose-400/25' },
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
    <div
      className={cn(
        'group relative h-full overflow-hidden rounded-2xl border bg-card p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover',
        className,
      )}
    >
      <span className={cn('pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-100', tones[tone].halo)} />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg ring-1 ring-white/20', tones[tone].tile)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="relative mt-2 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{value}</p>
      {hint && <p className="relative mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
