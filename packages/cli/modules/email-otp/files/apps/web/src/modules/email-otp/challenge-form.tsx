'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, api, errorMessage } from '@/lib/api';

interface SendResult {
  sent: boolean;
  resendIn: number;
  sentTo: string;
}

export function EmailOtpChallengeForm() {
  const router = useRouter();
  const nextParam = useSearchParams().get('next');
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard';
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const started = useRef(false);

  const expired = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.code === 'NO_PENDING_CHALLENGE') {
        router.push('/login?error=session_expired');
        return true;
      }
      return false;
    },
    [router],
  );

  const send = useCallback(
    async (resend = false) => {
      try {
        const res = await api.post<SendResult>('/email-otp/send', { resend });
        setSentTo(res.sentTo);
        setCooldown(res.resendIn);
        if (resend) toast.success('A new code is on its way');
      } catch (err) {
        if (!expired(err)) setError(errorMessage(err));
      }
    },
    [expired],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send();
  }, [send]);

  // Resend countdown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/email-otp/verify', { code });
      router.push(next);
      router.refresh();
    } catch (err) {
      if (expired(err)) return;
      setError(errorMessage(err));
      setCode('');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">
        {sentTo ? (
          <>
            We emailed a 6-digit code to <strong className="text-foreground">{sentTo}</strong>.
          </>
        ) : (
          'Sending your code…'
        )}
      </p>
      {error && <Alert variant="error">{error}</Alert>}
      <Field id="code" label="Verification code">
        <Input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          className="text-center font-mono text-2xl tracking-[0.5em]"
          autoFocus
        />
      </Field>
      <Button type="submit" className="w-full" loading={loading} disabled={code.length !== 6}>
        Verify and sign in
      </Button>
      <div className="text-center text-sm text-muted-foreground">
        Didn&apos;t get it?{' '}
        <Button
          type="button"
          variant="link"
          size="sm"
          disabled={cooldown > 0}
          loading={resending}
          onClick={async () => {
            setResending(true);
            await send(true);
            setResending(false);
          }}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </Button>
      </div>
    </form>
  );
}
