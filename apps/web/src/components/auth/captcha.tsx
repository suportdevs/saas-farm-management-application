'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldQuestion } from 'lucide-react';
import type { CaptchaInput } from '@kit/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/features';

export type CaptchaForm = 'login' | 'register' | 'forgot-password' | 'magic-link';

/**
 * Math captcha for a form. Renders nothing unless the API enables it for that
 * form. Tokens are single-use, so call `refresh()` after every submit.
 *
 *   const captcha = useCaptcha('login');
 *   api.post('/auth/login', { ...values, captcha: captcha.value });
 *   …{captcha.field}…
 */
export function useCaptcha(form: CaptchaForm) {
  const features = useFeatures();
  const enabled = Boolean(features?.auth?.captcha.includes(form));
  const [challenge, setChallenge] = useState<{ token: string; question: string } | null>(null);
  const [answer, setAnswer] = useState('');

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setAnswer('');
    setChallenge(await api.get<{ token: string; question: string }>('/auth/captcha').catch(() => null));
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value: CaptchaInput = enabled && challenge ? { token: challenge.token, answer } : undefined;
  const id = `captcha-${form}`;

  const field = enabled ? (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        <ShieldQuestion className="h-4 w-4 text-muted-foreground" /> Quick check: what is{' '}
        <span className="font-mono text-primary">{challenge?.question ?? '…'}</span>?
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={answer}
          onChange={(e) => setAnswer(e.target.value.replace(/[^\d-]/g, '').slice(0, 4))}
          placeholder="Answer"
          required
        />
        <Button type="button" variant="outline" size="icon" onClick={() => void refresh()} aria-label="New question">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  ) : null;

  return { enabled, value, field, refresh };
}
