'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

export function DeleteAccount({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onDelete = async () => {
    setLoading(true);
    try {
      await api.delete('/users/me', { password: password || undefined });
      toast.success('Your account has been deleted');
      router.push('/');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Delete account</CardTitle>
        <CardDescription>Permanently delete your account and all associated data. This cannot be undone.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {confirming ? (
          <>
            {hasPassword && (
              <Field id="delete-password" label="Confirm with your password">
                <Input id="delete-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            )}
            <div className="flex gap-2">
              <Button variant="destructive" onClick={onDelete} loading={loading} disabled={hasPassword && !password}>
                Permanently delete
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <Button variant="destructive" onClick={() => setConfirming(true)}>
            Delete my account
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
