'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, api, errorMessage } from '@/lib/api';

export function TwoFactorChallengeForm() {
  const router = useRouter();
  const nextParam = useSearchParams().get('next');
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard';
  const [useBackup, setUseBackup] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/two-factor/verify', { code });
      router.push(next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NO_PENDING_CHALLENGE') {
        router.push('/login?error=session_expired');
        return;
      }
      setError(errorMessage(err));
      setCode('');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      <Field id="code" label={useBackup ? 'Backup code' : 'Authentication code'}>
        <Input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode={useBackup ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          placeholder={useBackup ? 'xxxxx-xxxxx' : '123456'}
          className="text-center font-mono text-lg tracking-[0.3em]"
          autoFocus
        />
      </Field>
      <Button type="submit" className="w-full" loading={loading} disabled={!code}>
        Verify
      </Button>
      <button
        type="button"
        className="w-full text-center text-sm text-primary hover:underline"
        onClick={() => {
          setUseBackup((v) => !v);
          setCode('');
        }}
      >
        {useBackup ? 'Use your authenticator app instead' : 'Use a backup code instead'}
      </button>
    </form>
  );
}
