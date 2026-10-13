import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth-card';
import { getSession } from '@/lib/session';
import { EmailOtpChallengeForm } from '@/modules/email-otp/challenge-form';

export const metadata: Metadata = { title: 'Check your email' };

export default async function EmailOtpPage() {
  const { user, challenge } = await getSession();
  if (user) redirect('/dashboard');
  if (challenge !== 'email-otp') redirect('/login');

  return (
    <AuthCard
      title="Check your email"
      description="Enter the code we sent to finish signing in"
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <Suspense>
        <EmailOtpChallengeForm />
      </Suspense>
    </AuthCard>
  );
}
