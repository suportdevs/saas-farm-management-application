'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { LoginResponse } from '@kit/shared';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClasses } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { challengePath } from '@/modules/registry';

/**
 * Signs in on an explicit click rather than on page load, so email security
 * scanners that open links can't burn the single-use token.
 */
export function VerifyMagicLink() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [error, setError] = useState<string | null>(token ? null : 'This link is missing its token.');
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    try {
      const res = await api.post<LoginResponse & { next: string | null }>('/magic-link/verify', { token });
      const next = res.next ?? '/dashboard';
      router.push('challenge' in res ? `${challengePath(res.challenge)}?next=${encodeURIComponent(next)}` : next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  if (error)
    return (
      <div className="space-y-4">
        <Alert variant="error">{error}</Alert>
        <Link href="/login" className={buttonClasses('primary', 'md', 'w-full')}>
          Back to sign in
        </Link>
      </div>
    );

  return (
    <Button className="w-full" size="lg" onClick={signIn} loading={loading}>
      Continue to your account
    </Button>
  );
}
