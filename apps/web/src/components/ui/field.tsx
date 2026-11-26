'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/provider';
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
  // Labels, hints and messages are English phrases: shown in the interface language when translated.
  const t = useT();
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{t(label)}</Label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {t(error)}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{t(hint)}</p>
      ) : null}
    </div>
  );
}
