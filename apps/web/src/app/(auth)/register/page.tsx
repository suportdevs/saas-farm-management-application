import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth-card';
import { AuthProviders } from '@/components/auth/auth-providers';
import { RegisterForm } from '@/components/auth/register-form';
import { redirectIfAuthenticated } from '@/lib/session';

export const metadata: Metadata = { title: 'Create account' };

export default async function RegisterPage() {
  await redirectIfAuthenticated();
  return (
    <AuthCard
      title="Create your account"
      description="Start your free trial — no credit card required"
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <Suspense>
          <RegisterForm />
        </Suspense>
        <AuthProviders mode="register" />
      </div>
    </AuthCard>
  );
}
