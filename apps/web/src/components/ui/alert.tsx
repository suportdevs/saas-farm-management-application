import type { HTMLAttributes } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const styles = {
  info: { cls: 'border-primary/30 bg-primary/5 text-foreground', Icon: Info },
  success: { cls: 'border-success/30 bg-success/10 text-foreground', Icon: CheckCircle2 },
  error: { cls: 'border-destructive/30 bg-destructive/10 text-foreground', Icon: AlertCircle },
} as const;

export function Alert({
  variant = 'info',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof styles }) {
  const { cls, Icon } = styles[variant];
  return (
    <div role="alert" className={cn('flex gap-3 rounded-lg border p-3 text-sm', cls, className)} {...props}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1">{children}</div>
    </div>
  );
}
