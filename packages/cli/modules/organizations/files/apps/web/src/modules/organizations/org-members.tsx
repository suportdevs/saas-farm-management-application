'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Mail, X } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar } from '@/components/app/user-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api';
import { canManage, roleLabels, type Organization, type OrgInvitation, type OrgMember, type OrgRole } from './types';

export function OrgMembers({
  org,
  members,
  invitations,
  currentUserId,
}: {
  org: Organization;
  members: OrgMember[];
  invitations: OrgInvitation[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('member');
  const [busy, setBusy] = useState<string | null>(null);
  const manage = canManage(org.role);
  const assignable: OrgRole[] = org.role === 'owner' ? ['member', 'admin', 'owner'] : ['member', 'admin'];

  const run = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      router.refresh();
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run('invite', () => api.post(`/organizations/${org.id}/invitations`, { email, role }), `Invitation sent to ${email}`);
    if (ok) setEmail('');
  };

  return (
    <div className="space-y-6">
      {manage && (
        <Card>
          <form onSubmit={invite}>
            <CardHeader>
              <CardTitle>Invite people</CardTitle>
              <CardDescription>They&apos;ll get an email with a link to join {org.name}.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="min-w-60 flex-1"
                aria-label="Email address"
              />
              <Select value={role} onChange={(e) => setRole(e.target.value as OrgRole)} aria-label="Role">
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </Select>
              <Button type="submit" loading={busy === 'invite'} disabled={!email}>
                <Mail className="h-4 w-4" /> Send invite
              </Button>
            </CardContent>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {members.map((m) => {
              const self = m.userId === currentUserId;
              const editable = manage && !self && (org.role === 'owner' || m.role !== 'owner');
              return (
                <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar user={m} />
                    <div className="text-sm">
                      <p className="font-medium">
                        {m.name} {self && <span className="text-muted-foreground">(you)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {editable ? (
                      <Select
                        value={m.role}
                        disabled={busy === m.userId}
                        aria-label={`Role for ${m.name}`}
                        className="h-8 text-xs"
                        onChange={(e) =>
                          run(m.userId, () => api.patch(`/organizations/${org.id}/members/${m.userId}`, { role: e.target.value }), 'Role updated')
                        }
                      >
                        {assignable.map((r) => (
                          <option key={r} value={r}>
                            {roleLabels[r]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge variant={m.role === 'owner' ? 'primary' : 'default'}>{roleLabels[m.role]}</Badge>
                    )}
                    {editable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busy === `remove-${m.userId}`}
                        onClick={() => run(`remove-${m.userId}`, () => api.delete(`/organizations/${org.id}/members/${m.userId}`), `${m.name} removed`)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {manage && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <span>
                    {i.email} <Badge className="ml-1">{roleLabels[i.role]}</Badge>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    Expires {new Date(i.expiresAt).toLocaleDateString()}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Revoke invitation for ${i.email}`}
                      loading={busy === i.id}
                      onClick={() => run(i.id, () => api.delete(`/organizations/${org.id}/invitations/${i.id}`), 'Invitation revoked')}
                    >
                      {busy !== i.id && <X className="h-4 w-4" />}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
