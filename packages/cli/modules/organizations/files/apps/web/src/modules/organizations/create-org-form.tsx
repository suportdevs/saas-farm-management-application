'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, api, errorMessage } from '@/lib/api';
import type { Organization } from './types';

export function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { organization } = await api.post<{ organization: Organization }>('/organizations', { name });
      router.push(`/orgs/${organization.slug}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.details ? Object.values(err.details)[0]![0]! : errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit}>
        <CardHeader>
          <CardTitle>Create an organization</CardTitle>
          <CardDescription>Organizations let you collaborate with your team.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-60 flex-1">
              <Field id="org-name" label="Organization name">
                <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc" maxLength={100} />
              </Field>
            </div>
            <Button type="submit" loading={loading} disabled={name.trim().length < 2}>
              Create
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
