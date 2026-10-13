'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { updateProfileSchema, type PublicUser, type UpdateProfileInput } from '@kit/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { handleFormError } from '@/lib/form';

export function ProfileForm({ user }: { user: PublicUser }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<UpdateProfileInput>({ resolver: zodResolver(updateProfileSchema), defaultValues: { name: user.name } });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.patch('/users/me', values);
      reset(values);
      toast.success('Profile updated');
      router.refresh();
    } catch (err) {
      handleFormError(err, setError);
    }
  });

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>This information is visible to your team.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field id="name" label="Name" error={errors.name?.message ?? errors.root?.message}>
            <Input id="name" aria-invalid={!!errors.name} {...register('name')} />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
