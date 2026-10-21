'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Check, Clock, LogOut, Mail, MoreHorizontal, Send, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  assignableRoles,
  FARM_ROLES,
  PERMISSION_ACTION_LABELS,
  PERMISSION_MODULE_KEYS,
  PERMISSION_MODULES,
  ROLE_INFO,
  type FarmInvitation,
  type FarmMember,
  type FarmRole,
  type Permission,
} from '@kit/shared';
import { PageHeader } from '@/components/app/page-header';
import { Avatar } from '@/components/app/user-menu';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Menu, menuItemClasses } from '@/components/ui/menu';
import { Meter } from '@/components/ui/meter';
import { Select } from '@/components/ui/select';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useFarm } from '@/modules/farms/context';
import { formatDate, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

export function TeamManager({
  currentUserId,
  members,
  invitations,
  openInvite,
}: {
  currentUserId: string;
  members: FarmMember[];
  invitations: FarmInvitation[];
  openInvite: boolean;
}) {
  const router = useRouter();
  const { farm, membership, usage, limits } = useFarm();
  const myRole = membership.role;
  const can = (p: Permission) => membership.permissions.includes(p);
  const canInvite = can('members.invite');
  const [inviteOpen, setInviteOpen] = useState(openInvite);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<FarmMember | null>(null);
  const seatsFull = limits.members !== null && usage.members >= limits.members;

  const run = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const changeRole = (m: FarmMember, role: FarmRole) =>
    run(`role:${m.userId}`, () => api.patch(`/farms/${farm.slug}/members/${m.userId}`, { role }), `${m.name} is now ${ROLE_INFO[role].label.toLowerCase()}`);

  const remove = async (m: FarmMember) => {
    const self = m.userId === currentUserId;
    await run(`remove:${m.userId}`, () => api.delete(`/farms/${farm.slug}/members/${m.userId}`), self ? `You left ${farm.name}` : `${m.name} was removed`);
    setConfirmRemove(null);
    if (self) router.push('/dashboard');
  };

  const canEditRole = (m: FarmMember) => can('members.update') && m.userId !== currentUserId && (m.role !== 'owner' || myRole === 'owner');
  const canRemove = (m: FarmMember) => m.userId === currentUserId || (can('members.remove') && (m.role !== 'owner' || myRole === 'owner'));

  return (
    <>
      <PageHeader
        title="Team"
        description={`Everyone who works on ${farm.name}, and what they can do.`}
        actions={
          canInvite && (
            <Button onClick={() => setInviteOpen(true)} disabled={seatsFull} title={seatsFull ? 'All seats on your plan are in use' : undefined}>
              <UserPlus className="h-4 w-4" /> Invite member
            </Button>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base">Members</CardTitle>
              <CardDescription>
                {members.length} {members.length === 1 ? 'person' : 'people'} on this farm
              </CardDescription>
            </CardHeader>
            <ul className="divide-y">
              {members.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
                  <Avatar user={m} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {m.name}
                      {m.userId === currentUserId && <span className="font-normal text-muted-foreground"> (you)</span>}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {m.email}
                      {m.title && ` · ${m.title}`}
                    </p>
                  </div>
                  <p className="hidden w-32 text-xs text-muted-foreground md:block">
                    {m.lastActiveAt ? `Active ${timeAgo(m.lastActiveAt)}` : `Joined ${formatDate(m.joinedAt)}`}
                  </p>
                  {canEditRole(m) ? (
                    <Select
                      aria-label={`Role for ${m.name}`}
                      value={m.role}
                      disabled={busy === `role:${m.userId}`}
                      onChange={(e) => changeRole(m, e.target.value as FarmRole)}
                      className="h-9 w-40"
                    >
                      {assignableRoles(myRole).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_INFO[r].label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge variant={m.role === 'owner' ? 'primary' : 'default'} className="w-40 justify-center py-1.5">
                      {ROLE_INFO[m.role].label}
                    </Badge>
                  )}
                  {canRemove(m) ? (
                    <Menu
                      label={`Actions for ${m.name}`}
                      align="end"
                      triggerClassName="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                      trigger={<MoreHorizontal className="h-4 w-4" />}
                    >
                      {(close) => (
                        <button
                          type="button"
                          className={cn(menuItemClasses, 'text-destructive')}
                          onClick={() => {
                            close();
                            setConfirmRemove(m);
                          }}
                        >
                          {m.userId === currentUserId ? <LogOut className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                          {m.userId === currentUserId ? 'Leave farm' : 'Remove from farm'}
                        </button>
                      )}
                    </Menu>
                  ) : (
                    <span className="w-8" />
                  )}
                </li>
              ))}
            </ul>
          </Card>

          {canInvite && (
            <Card className="overflow-hidden">
              <CardHeader className="border-b pb-4">
                <CardTitle className="text-base">Pending invitations</CardTitle>
                <CardDescription>Invitations expire after 7 days. Re-inviting sends a fresh link.</CardDescription>
              </CardHeader>
              {invitations.length === 0 ? (
                <p className="flex items-center gap-2 px-6 py-6 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" /> No pending invitations.
                </p>
              ) : (
                <ul className="divide-y">
                  {invitations.map((inv) => (
                    <li key={inv.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed text-muted-foreground">
                        <Mail className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{inv.email}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> Expires {timeAgo(inv.expiresAt)}
                          {inv.invitedBy && ` · invited by ${inv.invitedBy}`}
                        </p>
                      </div>
                      <Badge variant="outline">{ROLE_INFO[inv.role].label}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busy === `resend:${inv.id}`}
                        onClick={() =>
                          run(`resend:${inv.id}`, () => api.post(`/farms/${farm.slug}/invitations`, { email: inv.email, role: inv.role, title: inv.title ?? '' }), 'Invitation re-sent')
                        }
                      >
                        <Send className="h-3.5 w-3.5" /> Resend
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        loading={busy === `revoke:${inv.id}`}
                        onClick={() => run(`revoke:${inv.id}`, () => api.delete(`/farms/${farm.slug}/invitations/${inv.id}`), 'Invitation revoked')}
                      >
                        <X className="h-3.5 w-3.5" /> Revoke
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Seats</CardTitle>
              <CardDescription>Members and pending invitations both use a seat.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Meter label="Team seats" value={usage.members} max={limits.members} />
              {seatsFull && membership.permissions.includes('billing.view') && (
                <Link href={`/farms/${farm.slug}/billing`} className={cn(buttonClasses('primary', 'sm'), 'w-full')}>
                  Upgrade for more seats
                </Link>
              )}
            </CardContent>
          </Card>
          <RolesGuide />
        </aside>
      </div>

      {canInvite && <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onInvited={() => router.refresh()} />}

      <Dialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        title={confirmRemove?.userId === currentUserId ? `Leave ${farm.name}?` : `Remove ${confirmRemove?.name}?`}
        description={
          confirmRemove?.userId === currentUserId
            ? "You'll lose access to this farm until someone invites you again."
            : 'They will immediately lose access to this farm. Records they created stay in place.'
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={busy?.startsWith('remove:')} onClick={() => confirmRemove && remove(confirmRemove)}>
              {confirmRemove?.userId === currentUserId ? 'Leave farm' : 'Remove'}
            </Button>
          </>
        }
      />
    </>
  );
}

function InviteDialog({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: () => void }) {
  const { farm, membership } = useFarm();
  const roles = assignableRoles(membership.role);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<FarmRole>('worker');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api.post(`/farms/${farm.slug}/invitations`, { email, role, title });
      toast.success(`Invitation sent to ${email}`);
      setEmail('');
      setTitle('');
      onInvited();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError && err.details ? Object.values(err.details)[0]?.[0] ?? err.message : errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Invite to ${farm.name}`} description="They'll get an email with a link to join. It works for new and existing accounts.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field id="invite-email" label="Email address" error={error ?? undefined}>
          <Input id="invite-email" type="email" autoFocus required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="invite-title" label="Job title (optional)">
          <Input id="invite-title" placeholder="e.g. Herd manager" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <fieldset>
          <legend className="text-sm font-medium">Role</legend>
          <div className="mt-2 grid gap-2">
            {roles.map((r) => (
              <label
                key={r}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50',
                  role === r && 'border-primary bg-primary/5',
                )}
              >
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-1 accent-[var(--primary)]" />
                <span>
                  <span className="block text-sm font-medium">{ROLE_INFO[r].label}</span>
                  <span className="block text-xs text-muted-foreground">{ROLE_INFO[r].description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={sending} disabled={!email}>
            <Send className="h-4 w-4" /> Send invitation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** What each role can do on this farm, including the farm's own changes to the role. */
function RolesGuide() {
  const { farm, membership, rolePermissions } = useFarm();
  const [selected, setSelected] = useState<FarmRole>('manager');
  const granted = rolePermissions[selected];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" /> What each role can do
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {FARM_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setSelected(r)}
              className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-colors', selected === r ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              {ROLE_INFO[r].label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{ROLE_INFO[selected].description}</p>
        <ul className="space-y-2 text-sm">
          {PERMISSION_MODULE_KEYS.map((m) => {
            const held = PERMISSION_MODULES[m].actions.filter((a) => granted.includes(`${m}.${a}` as Permission));
            return (
              <li key={m} className={cn('flex items-start gap-2', !held.length && 'text-muted-foreground/60')}>
                {held.length ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>
                  {PERMISSION_MODULES[m].label}
                  {held.length > 0 && <span className="block text-xs text-muted-foreground">{held.map((a) => PERMISSION_ACTION_LABELS[a]).join(' · ')}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        {membership.permissions.includes('roles.view') && (
          <Link href={`/farms/${farm.slug}/permissions`} className={cn(buttonClasses('outline', 'sm'), 'w-full')}>
            Roles & permissions
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
