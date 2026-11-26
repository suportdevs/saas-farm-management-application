'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { LANGUAGES } from '@kit/shared';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useT, useUserLanguage } from './provider';

/**
 * The user's own interface language (saved on their account, so it follows
 * them to every device). "Farm default" follows each farm's language.
 */
export function LanguagePicker() {
  const t = useT();
  const router = useRouter();
  const current = useUserLanguage();
  const [saving, setSaving] = useState<string | null>(null);

  const choose = async (language: string | null) => {
    setSaving(language ?? 'farm');
    try {
      await api.patch('/users/me', { language });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const options: { value: string | null; label: string; hint?: string }[] = [
    { value: null, label: t('Farm default') },
    ...LANGUAGES.map((l) => ({ value: l.code, label: l.native, hint: l.native === l.label ? undefined : l.label })),
  ];

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {options.map((o) => {
        const selected = current === o.value || (!current && o.value === null);
        const busy = saving === (o.value ?? 'farm');
        return (
          <button
            key={o.value ?? 'farm'}
            type="button"
            onClick={() => choose(o.value)}
            aria-pressed={selected}
            disabled={!!saving}
            className={cn(
              'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
              selected ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-muted',
            )}
          >
            <span>
              {o.label}
              {o.hint && <span className="ml-1 text-xs text-muted-foreground">{o.hint}</span>}
            </span>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : selected && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}
