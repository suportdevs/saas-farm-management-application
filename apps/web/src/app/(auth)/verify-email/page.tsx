'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AuthCard } from '@/components/auth-card';
import { Alert } from '@/components/ui/alert';
import { buttonClasses } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';

function VerifyEmail() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'error'; message?: string }>({ status: 'loading' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // tokens are single-use; guard against double effects
    started.current = true;
    if (!token) {
      setState({ status: 'error', message: 'This link is missing its verification token.' });
      return;
    }
    api
      .post('/auth/verify-email', { token })
      .then(() => setState({ status: 'ok' }))
      .catch((err) => setState({ status: 'error', message: errorMessage(err) }));
  }, [token]);

  if (state.status === 'loading')
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Verifying your email…
      </div>
    );

  return (
    <div className="space-y-4">
      {state.status === 'ok' ? (
        <Alert variant="success">Your email address has been verified. 🎉</Alert>
      ) : (
        <Alert variant="error">{state.message}</Alert>
      )}
      <Link href="/dashboard" className={buttonClasses('primary', 'md', 'w-full')}>
        Continue to dashboard
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthCard title="Email verification">
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </AuthCard>
  );
}
