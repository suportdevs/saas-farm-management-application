'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Building2, Crown, Mail, RotateCw, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { FARM_ROLES, ROLE_INFO, roleLabel, type FarmInvitation, type FarmMember, type FarmRole, type PlatformOrganization } from '@kit/shared';
import { Avatar } from '@/components/app/user-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { OrganizationPicker } from './organization-picker';

type Open = 'add' | 'owner' | 'move' | null;

/**
 * A client's farm team as the platform team manages it: add people, change
 * roles, hand over ownership, move the farm to another organization, and
 * resend or revoke invitations.
 */
export function TenantTeam({
  farmId,
  organization,
  members,
  invitations,
  canManage,
}: {
  farmId: string;
  organization: { id: string; name: string };
  members: FarmMember[];
  invitations: FarmInvitation[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const base = `/admin/farms/${farmId}`;

  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      setOpen(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Team ({members.length})</CardTitle>
        {canManage && (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" onClick={() => setOpen('add')}>
              <UserPlus className="h-4 w-4" /> Add
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen('owner')}>
              <Crown className="h-4 w-4" /> Transfer
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Organization</span>
          <Link href={`/admin/farms?organizationId=${organization.id}`} className="font-medium hover:text-primary">
            {organization.name}
          </Link>
          {canManage && (
            <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setOpen('move')}>
              Move
            </Button>
          )}
        </div>

        <ul className="space-y-3">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3">
              <Avatar user={m} size={32} />
              <Link href={`/admin/users/${m.userId}`} className="min-w-0 flex-1 hover:text-primary">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </Link>
              {canManage && !m.customRole ? (
                <Select
                  aria-label={`Role of ${m.name}`}
                  value={m.role}
                  disabled={busy}
                  onChange={(e) => run(() => api.patch(`${base}/members/${m.userId}`, { role: e.target.value }), 'Role updated')}
                >
                  {FARM_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_INFO[r].label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Badge variant={m.role === 'owner' ? 'primary' : 'default'}>{roleLabel(m.role, m.customRole)}</Badge>
              )}
              {canManage && (
                <Button size="icon" variant="ghost" aria-label={`Remove ${m.name}`} disabled={busy} onClick={() => run(() => api.delete(`${base}/members/${m.userId}`), `${m.name} removed`)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>

        {invitations.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending invitations</p>
            <ul className="space-y-2">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{i.email}</span>
                  <Badge variant="outline">{roleLabel(i.role, i.customRole)}</Badge>
                  <span className="text-xs text-muted-foreground">until {formatDate(i.expiresAt)}</span>
                  {canManage && (
                    <>
                      <Button size="icon" variant="ghost" aria-label={`Resend to ${i.email}`} disabled={busy} onClick={() => run(() => api.post(`${base}/invitations/${i.id}/resend`), 'Invitation sent again')}>
                        <RotateCw className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Revoke ${i.email}`} disabled={busy} onClick={() => run(() => api.delete(`${base}/invitations/${i.id}`), 'Invitation revoked')}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      {open === 'add' && <AddDialog busy={busy} onClose={() => setOpen(null)} onSubmit={(body) => run(() => api.post(`${base}/members`, body), 'Team updated')} />}
      {open === 'owner' && (
        <TransferDialog members={members} busy={busy} onClose={() => setOpen(null)} onSubmit={(body) => run(() => api.post(`${base}/owner`, body), 'Ownership transferred')} />
      )}
      {open === 'move' && (
        <MoveDialog current={organization} busy={busy} onClose={() => setOpen(null)} onSubmit={(organizationId) => run(() => api.patch(`${base}/organization`, { organizationId }), 'Farm moved')} />
      )}
    </Card>
  );
}

function AddDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (body: { email: string; role: FarmRole }) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<FarmRole>('worker');
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add to the team"
      description="Someone with an account joins straight away; anyone else gets an invitation email."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!email.includes('@')} onClick={() => onSubmit({ email, role })}>
            Add
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field id="team-email" label="Email">
          <Input id="team-email" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="team-role" label="Role" hint={ROLE_INFO[role].description}>
          <Select id="team-role" className="w-full" value={role} onChange={(e) => setRole(e.target.value as FarmRole)}>
            {FARM_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_INFO[r].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function TransferDialog({
  members,
  busy,
  onClose,
  onSubmit,
}: {
  members: FarmMember[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: { userId: string; keepOwners: boolean }) => void;
}) {
  const candidates = members.filter((m) => m.role !== 'owner');
  const [userId, setUserId] = useState(candidates[0]?.userId ?? '');
  const [keepOwners, setKeepOwners] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Transfer ownership"
      description="The new owner gets full control. If the farm now belongs to another business, also move it to their organization."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!userId} onClick={() => onSubmit({ userId, keepOwners })}>
            Transfer
          </Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add the new owner to the team first.</p>
      ) : (
        <div className="space-y-4">
          <Field id="transfer-to" label="New owner">
            <Select id="transfer-to" className="w-full" value={userId} onChange={(e) => setUserId(e.target.value)}>
              {candidates.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} ({m.email})
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={keepOwners} onChange={(e) => setKeepOwners(e.target.checked)} />
            Keep the current owners as owners (otherwise they become managers)
          </label>
        </div>
      )}
    </Dialog>
  );
}

function MoveDialog({
  current,
  busy,
  onClose,
  onSubmit,
}: {
  current: { id: string; name: string };
  busy: boolean;
  onClose: () => void;
  onSubmit: (organizationId: string) => void;
}) {
  const [org, setOrg] = useState<PlatformOrganization | null>(null);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Move to another organization"
      description={`Owners and admins of ${current.name} lose their access through it. The farm's own team stays.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!org || org.id === current.id} onClick={() => org && onSubmit(org.id)}>
            Move farm
          </Button>
        </>
      }
    >
      <OrganizationPicker value={org} onChange={setOrg} />
    </Dialog>
  );
}
