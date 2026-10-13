'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint } from 'lucide-react';
import { toast } from 'sonner';
import type { LoginResponse } from '@kit/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { challengePath } from '@/modules/registry';
import { passkeyError } from './passkey-settings';

function PasskeyButton() {
  const router = useRouter();
  const nextParam = useSearchParams().get('next');
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard';
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  if (!supported) return null;

  const signInWithPasskey = async () => {
    setLoading(true);
    try {
      const optionsJSON = await api.post<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/passkeys/login/options');
      const response = await startAuthentication({ optionsJSON });
      const res = await api.post<LoginResponse>('/passkeys/login/verify', { response });
      router.push('challenge' in res ? `${challengePath(res.challenge)}?next=${encodeURIComponent(next)}` : next);
      router.refresh();
    } catch (err) {
      const message = passkeyError(err);
      if (message) toast.error(message);
      setLoading(false);
    }
  };

  return (
    <Button type="button" variant="outline" className="w-full" onClick={signInWithPasskey} loading={loading}>
      {!loading && <Fingerprint className="h-4 w-4" />} Sign in with a passkey
    </Button>
  );
}

/** Login-page slot: passwordless sign-in with any passkey saved for this site. */
export function PasskeyLogin({ mode }: { mode: 'login' | 'register' }) {
  if (mode !== 'login') return null;
  return (
    <Suspense>
      <PasskeyButton />
    </Suspense>
  );
}
