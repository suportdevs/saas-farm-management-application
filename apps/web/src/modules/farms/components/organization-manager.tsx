'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { canManageOrg, ORG_ROLE_INFO, ORG_ROLES, type OrganizationDetail, type OrgRole } from '@kit/shared';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api';
import { countryName, flag } from '@/lib/format';
import { FarmTile } from './farm-switcher';

/** An organization: its farms (each with its own plan), members and settings. */
export function OrganizationManager({ detail, currentUserId }: { detail: OrganizationDetail; currentUserId: string }) {
  const router = useRouter();
  const { organization, role, farms, members } = detail;
  const canManage = canManageOrg(role);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, message: string, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      after?.();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Farms</CardTitle>
            <CardDescription>Each farm has its own team, plan and billing.</CardDescription>
          </div>
          {canManage && (
            <Link href={`/onboarding?org=${organization.id}`} className={buttonClasses('outline', 'sm')}>
              <Plus className="h-4 w-4" /> Add farm
            </Link>
          )}
        </CardHeader>
        <CardContent className="divide-y p-0">
          {farms.length === 0 && <p className="px-6 py-8 text-center text-sm text-muted-foreground">No farms yet.</p>}
          {farms.map((f) => (
            <Link key={f.id} href={`/farms/${f.slug}`} className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/40">
              <FarmTile farm={f} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{f.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {flag(f.country)} {countryName(f.country)} · {f.memberCount} {f.memberCount === 1 ? 'member' : 'members'}
                </span>
              </span>
              {f.suspended && <Badge variant="destructive">Suspended</Badge>}
              <Badge variant="outline">{f.planName || f.planId}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              Owners act as owner on every farm, admins as manager. Members get farm access from each farm&apos;s team.
            </CardDescription>
          </div>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <UserPlus className="h-4 w-4" /> Add member
            </Button>
          )}
        </CardHeader>
        <CardContent className="divide-y p-0">
          {members.map((m) => {
            const self = m.userId === currentUserId;
            // Only owners manage owners; nobody changes their own role.
            const editable = canManage && !self && (role === 'owner' || m.role !== 'owner');
            return (
              <div key={m.userId} className="flex flex-wrap items-center gap-3 px-6 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {m.name} {self && <span className="text-xs text-muted-foreground">(you)</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                </span>
                {editable ? (
                  <Select
                    aria-label={`Role of ${m.name}`}
                    value={m.role}
                    disabled={busy}
                    onChange={(e) => run(() => api.patch(`/organizations/${organization.id}/members/${m.userId}`, { role: e.target.value }), 'Role updated')}
                  >
                    {ORG_ROLES.filter((r) => role === 'owner' || r !== 'owner').map((r) => (
                      <option key={r} value={r}>
                        {ORG_ROLE_INFO[r].label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge variant={m.role === 'member' ? 'outline' : 'primary'}>{ORG_ROLE_INFO[m.role].label}</Badge>
                )}
                {(editable || self) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={self ? 'Leave organization' : `Remove ${m.name}`}
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api.delete(`/organizations/${organization.id}/members/${m.userId}`),
                        self ? 'You left the organization' : `${m.name} removed`,
                        self ? () => router.push('/organizations') : undefined,
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {canManage && <SettingsCard detail={detail} />}

      {adding && <AddMemberDialog organizationId={organization.id} actorRole={role} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); router.refresh(); }} />}
    </div>
  );
}

function SettingsCard({ detail }: { detail: OrganizationDetail }) {
  const router = useRouter();
  const { organization, role, farms } = detail;
  const [name, setName] = useState(organization.name);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/organizations/${organization.id}`, { name });
      toast.success('Organization renamed');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/organizations/${organization.id}`);
      toast.success('Organization deleted');
      router.push('/organizations');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-60 flex-1">
            <Field id="org-rename" label="Name">
              <Input id="org-rename" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Button loading={saving} disabled={name.trim().length < 2 || name === organization.name} onClick={save}>
            Save
          </Button>
        </div>
        {role === 'owner' && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 p-4">
            <p className="text-sm text-muted-foreground">{farms.length ? 'Move or delete its farms before deleting the organization.' : 'Delete this organization for good.'}</p>
            <Button variant="destructive" disabled={farms.length > 0} onClick={() => setDeleting(true)}>
              Delete organization
            </Button>
          </div>
        )}
      </CardContent>
      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete ${organization.name}?`}
        description="The organization and its member list are removed."
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Delete
            </Button>
          </>
        }
      />
    </Card>
  );
}

function AddMemberDialog({ organizationId, actorRole, onClose, onAdded }: { organizationId: string; actorRole: OrgRole; onClose: () => void; onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('member');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    setSaving(true);
    try {
      await api.post(`/organizations/${organizationId}/members`, { email, role });
      toast.success('Member added');
      onAdded();
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add member"
      description="They need an account already. To bring someone new, invite them to one of the farms."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!email.includes('@')} onClick={add}>
            Add
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field id="org-member-email" label="Email">
          <Input id="org-member-email" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="org-member-role" label="Role" hint={ORG_ROLE_INFO[role].description}>
          <Select id="org-member-role" className="w-full" value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
            {ORG_ROLES.filter((r) => actorRole === 'owner' || r !== 'owner').map((r) => (
              <option key={r} value={r}>
                {ORG_ROLE_INFO[r].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}
