import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth-card';
import { VerifyMagicLink } from '@/modules/magic-link/verify-link';

export const metadata: Metadata = { title: 'Sign in with your link' };

export default function MagicLinkPage() {
  return (
    <AuthCard title="You're almost in ✨" description="Click below to finish signing in on this device.">
      <Suspense>
        <VerifyMagicLink />
      </Suspense>
    </AuthCard>
  );
}
