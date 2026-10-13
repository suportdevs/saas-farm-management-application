'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { changeEmailSchema, type ChangeEmailInput, type PublicUser } from '@kit/shared';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { handleFormError } from '@/lib/form';

export function EmailForm({ user }: { user: PublicUser }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangeEmailInput>({ resolver: zodResolver(changeEmailSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.post('/users/me/email', values);
      setSentTo(values.newEmail);
      reset({ newEmail: '', password: '' });
    } catch (err) {
      handleFormError(err, setError);
    }
  });

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Email address</CardTitle>
          <CardDescription>
            Your current email is <strong className="text-foreground">{user.email}</strong>{' '}
            {user.emailVerified ? <Badge variant="success">Verified</Badge> : <Badge>Unverified</Badge>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sentTo && (
            <Alert variant="success">
              We sent a confirmation link to <strong>{sentTo}</strong>. Your email changes once you click it.
            </Alert>
          )}
          {errors.root && <Alert variant="error">{errors.root.message}</Alert>}
          <Field id="newEmail" label="New email" error={errors.newEmail?.message}>
            <Input id="newEmail" type="email" autoComplete="email" aria-invalid={!!errors.newEmail} {...register('newEmail')} />
          </Field>
          {user.hasPassword && (
            <Field id="email-password" label="Current password" error={errors.password?.message}>
              <Input id="email-password" type="password" autoComplete="current-password" {...register('password')} />
            </Field>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={isSubmitting}>
            Send confirmation link
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
