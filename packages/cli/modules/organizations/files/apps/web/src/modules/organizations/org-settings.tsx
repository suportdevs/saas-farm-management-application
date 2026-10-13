'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { canManage, type Organization } from './types';

export function OrgSettings({ org, currentUserId }: { org: Organization; currentUserId: string }) {
  const router = useRouter();
  const [name, setName] = useState(org.name);
  const [slug, setSlug] = useState(org.slug);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('save');
    try {
      const { organization } = await api.patch<{ organization: Organization }>(`/organizations/${org.id}`, { name, slug });
      toast.success('Organization updated');
      router.replace(`/orgs/${organization.slug}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const leaveOrDelete = async (action: 'leave' | 'delete') => {
    setBusy(action);
    try {
      if (action === 'delete') await api.delete(`/organizations/${org.id}`);
      else await api.delete(`/organizations/${org.id}/members/${currentUserId}`);
      toast.success(action === 'delete' ? 'Organization deleted' : `You left ${org.name}`);
      router.push('/orgs');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {canManage(org.role) && (
        <Card>
          <form onSubmit={save}>
            <CardHeader>
              <CardTitle>General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field id="org-name" label="Name">
                <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              </Field>
              <Field id="org-slug" label="URL" hint={`/orgs/${slug || '…'}`}>
                <Input id="org-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={48} />
              </Field>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" loading={busy === 'save'} disabled={name === org.name && slug === org.slug}>
                Save changes
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            {org.role === 'owner'
              ? 'Deleting the organization removes it for every member. This cannot be undone.'
              : 'Leaving removes your access until someone invites you again.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {org.role === 'owner' ? (
            <>
              <Field id="org-delete" label={`Type ${org.slug} to confirm`}>
                <Input id="org-delete" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" disabled={confirm !== org.slug} loading={busy === 'delete'} onClick={() => leaveOrDelete('delete')}>
                  Delete organization
                </Button>
                <Button variant="outline" loading={busy === 'leave'} onClick={() => leaveOrDelete('leave')}>
                  Leave organization
                </Button>
              </div>
            </>
          ) : (
            <Button variant="destructive" loading={busy === 'leave'} onClick={() => leaveOrDelete('leave')}>
              Leave organization
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
