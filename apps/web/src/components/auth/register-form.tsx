'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type LoginResponse, type RegisterInput } from '@kit/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { handleFormError } from '@/lib/form';
import { challengePath } from '@/modules/registry';
import { useCaptcha } from './captcha';
import { safeNext } from './login-form';

export function RegisterForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const captcha = useCaptcha('register');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await api.post<LoginResponse>('/auth/register', { ...values, captcha: captcha.value });
      router.push('challenge' in res ? challengePath(res.challenge) : next);
      router.refresh();
    } catch (err) {
      handleFormError(err, setError);
      void captcha.refresh();
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {errors.root && <Alert variant="error">{errors.root.message}</Alert>}
      <Field id="name" label="Full name" error={errors.name?.message}>
        <Input id="name" autoComplete="name" placeholder="Jane Doe" aria-invalid={!!errors.name} {...register('name')} />
      </Field>
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" aria-invalid={!!errors.email} {...register('email')} />
      </Field>
      <Field id="password" label="Password" error={errors.password?.message} hint="At least 8 characters with upper & lower case letters and a number.">
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
      </Field>
      {captcha.field}
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Create account
      </Button>
    </form>
  );
}
