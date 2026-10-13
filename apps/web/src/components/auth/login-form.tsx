'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput, type LoginResponse } from '@kit/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { handleFormError } from '@/lib/form';
import { useCaptcha } from './captcha';
import { challengePath } from '@/modules/registry';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const captcha = useCaptcha('login');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { remember: true } });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await api.post<LoginResponse>('/auth/login', { ...values, captcha: captcha.value });
      if ('challenge' in res) {
        router.push(`${challengePath(res.challenge)}?next=${encodeURIComponent(next)}`);
      } else {
        router.push(next);
        router.refresh();
      }
    } catch (err) {
      handleFormError(err, setError);
      void captcha.refresh();
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {errors.root && <Alert variant="error">{errors.root.message}</Alert>}
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" aria-invalid={!!errors.email} {...register('email')} />
      </Field>
      <Field
        id="password"
        label="Password"
        error={errors.password?.message}
        action={
          <Link href="/forgot-password" className="text-xs text-primary hover:underline">
            Forgot password?
          </Link>
        }
      >
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register('password')} />
      </Field>
      {captcha.field}
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox {...register('remember')} /> Keep me signed in
      </label>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}

/** Only allow relative in-app redirects to avoid open-redirect issues. */
export function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}
