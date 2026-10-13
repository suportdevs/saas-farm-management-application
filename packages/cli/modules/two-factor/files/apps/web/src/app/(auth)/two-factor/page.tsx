import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth-card';
import { getSession } from '@/lib/session';
import { TwoFactorChallengeForm } from '@/modules/two-factor/challenge-form';

export const metadata: Metadata = { title: 'Two-factor authentication' };

export default async function TwoFactorPage() {
  const { user, challenge } = await getSession();
  if (user) redirect('/dashboard');
  if (challenge !== 'two-factor') redirect('/login');

  return (
    <AuthCard
      title="Two-factor authentication"
      description="Enter the 6-digit code from your authenticator app"
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <Suspense>
        <TwoFactorChallengeForm />
      </Suspense>
    </AuthCard>
  );
}
