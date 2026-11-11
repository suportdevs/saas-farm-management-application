import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

export function Field({
  id,
  label,
  error,
  hint,
  action,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
