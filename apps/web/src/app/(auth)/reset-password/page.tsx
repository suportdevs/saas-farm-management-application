'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema, type ResetPasswordInput } from '@kit/shared';
import { AuthCard } from '@/components/auth-card';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClasses } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { handleFormError } from '@/lib/form';

function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { token } });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.post('/auth/reset-password', values);
      setDone(true);
    } catch (err) {
      handleFormError(err, setError);
    }
  });

  if (!token) return <Alert variant="error">This reset link is missing its token. Please request a new one.</Alert>;
  if (done)
    return (
      <div className="space-y-4">
        <Alert variant="success">Your password has been reset. Please sign in with your new password.</Alert>
        <Link href="/login" className={buttonClasses('primary', 'md', 'w-full')}>
          Go to sign in
        </Link>
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {(errors.root || errors.token) && <Alert variant="error">{errors.root?.message ?? errors.token?.message}</Alert>}
      <input type="hidden" {...register('token')} />
      <Field id="password" label="New password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Reset password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password" description="Signing in again will be required on all devices">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
