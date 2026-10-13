import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth-card';
import { AuthProviders } from '@/components/auth/auth-providers';
import { LoginForm } from '@/components/auth/login-form';
import { Alert } from '@/components/ui/alert';
import { redirectIfAuthenticated } from '@/lib/session';

export const metadata: Metadata = { title: 'Sign in' };

const errorMessages: Record<string, string> = {
  oauth_failed: 'Social sign-in failed. Please try again.',
  oauth_cancelled: 'Social sign-in was cancelled.',
  oauth_account_in_use: 'That social account is already connected to a different user.',
  magic_link_invalid: 'That sign-in link is invalid or has expired. Request a new one.',
  oauth_email_missing: 'Your social account did not share a verified email address.',
  session_expired: 'Your session expired. Please sign in again.',
  account_suspended: 'This account has been suspended. Contact support if you think this is a mistake.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await redirectIfAuthenticated();
  const { error } = await searchParams;
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your account to continue"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert variant="error">{errorMessages[error] ?? 'Sign-in failed. Please try again.'}</Alert>}
        <Suspense>
          <LoginForm />
        </Suspense>
        <AuthProviders mode="login" />
      </div>
    </AuthCard>
  );
}
