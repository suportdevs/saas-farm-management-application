'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AdminUser } from '@kit/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

type Pending = null | 'ban' | 'delete';

export function UserActions({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');

  const run = async (key: string, fn: () => Promise<unknown>, success: string, after?: () => void) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      setPending(null);
      if (after) after();
      else router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const impersonate = async () => {
    setBusy('impersonate');
    try {
      const res = await api.post<{ redirect: string }>(`/admin/users/${user.id}/impersonate`);
      router.push(res.redirect);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Change this user&apos;s role, verification and sessions.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={isSelf}
            loading={busy === 'role'}
            onClick={() =>
              run('role', () => api.patch(`/admin/users/${user.id}`, { role: user.role === 'admin' ? 'user' : 'admin' }), 'Role updated')
            }
          >
            {user.role === 'admin' ? 'Remove admin' : 'Make admin'}
          </Button>
          <Button
            variant="outline"
            loading={busy === 'verify'}
            onClick={() =>
              run('verify', () => api.patch(`/admin/users/${user.id}`, { emailVerified: !user.emailVerified }), 'Verification updated')
            }
          >
            {user.emailVerified ? 'Mark email unverified' : 'Mark email verified'}
          </Button>
          <Button
            variant="outline"
            disabled={isSelf}
            loading={busy === 'sessions'}
            onClick={() => run('sessions', () => api.delete(`/admin/users/${user.id}/sessions`), 'All sessions revoked')}
          >
            Sign out everywhere
          </Button>
          <Button
            variant="outline"
            disabled={isSelf || user.role === 'admin' || Boolean(user.bannedAt)}
            loading={busy === 'impersonate'}
            onClick={impersonate}
            title={user.role === 'admin' ? "Admins can't be impersonated" : undefined}
          >
            Impersonate
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>Suspending signs the user out and blocks sign-in. Deleting is permanent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pending === 'ban' && (
            <div className="space-y-3">
              <Field id="ban-reason" label="Reason (shared with the user by email)">
                <Input id="ban-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
              </Field>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  loading={busy === 'ban'}
                  onClick={() => run('ban', () => api.post(`/admin/users/${user.id}/ban`, { reason: reason || undefined }), 'User suspended')}
                >
                  Suspend user
                </Button>
                <Button variant="ghost" onClick={() => setPending(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {pending === 'delete' && (
            <div className="space-y-3">
              <Field id="delete-confirm" label={`Type ${user.email} to confirm`}>
                <Input id="delete-confirm" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoFocus />
              </Field>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={confirmEmail !== user.email}
                  loading={busy === 'delete'}
                  onClick={() =>
                    run('delete', () => api.delete(`/admin/users/${user.id}`), 'User deleted', () => {
                      router.push('/admin/users');
                      router.refresh();
                    })
                  }
                >
                  Delete permanently
                </Button>
                <Button variant="ghost" onClick={() => setPending(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {pending === null && (
            <div className="flex flex-wrap gap-2">
              {user.bannedAt ? (
                <Button
                  variant="outline"
                  loading={busy === 'unban'}
                  onClick={() => run('unban', () => api.post(`/admin/users/${user.id}/unban`), 'User unsuspended')}
                >
                  Unsuspend
                </Button>
              ) : (
                <Button variant="destructive" disabled={isSelf} onClick={() => setPending('ban')}>
                  Suspend
                </Button>
              )}
              <Button variant="destructive" disabled={isSelf} onClick={() => setPending('delete')}>
                Delete user
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
