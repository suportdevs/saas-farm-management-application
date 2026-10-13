'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { changePasswordSchema, type ChangePasswordInput } from '@kit/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { api } from '@/lib/api';
import { handleFormError } from '@/lib/form';

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.post('/users/me/password', values);
      reset({ currentPassword: '', newPassword: '' });
      toast.success(hasPassword ? 'Password changed. Other sessions were signed out.' : 'Password set');
    } catch (err) {
      handleFormError(err, setError);
    }
  });

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>{hasPassword ? 'Change password' : 'Set a password'}</CardTitle>
          <CardDescription>
            {hasPassword
              ? 'Changing your password signs you out of all other devices.'
              : 'Your account uses social sign-in. Set a password to also sign in with email.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errors.root && <Alert variant="error">{errors.root.message}</Alert>}
          {hasPassword && (
            <Field id="currentPassword" label="Current password" error={errors.currentPassword?.message}>
              <Input id="currentPassword" type="password" autoComplete="current-password" {...register('currentPassword')} />
            </Field>
          )}
          <Field id="newPassword" label="New password" error={errors.newPassword?.message}>
            <Input id="newPassword" type="password" autoComplete="new-password" {...register('newPassword')} />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={isSubmitting}>
            {hasPassword ? 'Update password' : 'Set password'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
