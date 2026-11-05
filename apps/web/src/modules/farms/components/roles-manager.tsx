'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { KeyRound, Lock, Pencil, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { FARM_ROLES, ROLE_INFO, type FarmCustomRole, type FarmPermissions, type FarmRole } from '@kit/shared';
import { PageHeader } from '@/components/app/page-header';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ApiError, api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useFarm } from '@/modules/farms/context';
import { ROLE_KEY_COUNT } from './permissions-manager';

type SystemRole = Exclude<FarmRole, 'owner'>;
const SYSTEM_ROLES = FARM_ROLES.filter((r): r is SystemRole => r !== 'owner');

/** The name / description modal: a new custom role, or one being renamed. */
type Editing = { mode: 'create' } | { mode: 'edit'; role: FarmCustomRole } | null;

/** One row of the list: built-in and custom roles side by side. */
interface RoleRow {
  /** URL segment of the role's permission page: a system key or a custom role id. */
  id: string;
  name: string;
  description: string;
  kind: 'owner' | 'system' | 'custom';
  permissionCount: number;
  people: number;
  customized: boolean;
  updatedAt: string | null;
  custom: FarmCustomRole | null;
}

/**
 * Roles as a list. Create and rename custom roles in a modal; "Give
 * permission" opens the role's permission page (module → operation → actions).
 */
export function RolesManager({ initial }: { initial: FarmPermissions }) {
  const router = useRouter();
  const { farm, membership } = useFarm();
  const canManage = membership.permissions.includes('roles.manage');
  const [data, setData] = useState(initial);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<FarmCustomRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'system' | 'custom'>('all');

  // People on a built-in role (members with a custom role are counted there instead).
  const peopleOn = (role: FarmRole) => data.members.filter((m) => m.role === role && !m.customRoleId).length;

  const rows: RoleRow[] = [
    {
      id: 'owner',
      name: ROLE_INFO.owner.label,
      description: ROLE_INFO.owner.description,
      kind: 'owner',
      permissionCount: ROLE_KEY_COUNT,
      people: peopleOn('owner'),
      customized: false,
      updatedAt: null,
      custom: null,
    },
    ...SYSTEM_ROLES.map(
      (r): RoleRow => ({
        id: r,
        name: ROLE_INFO[r].label,
        description: ROLE_INFO[r].description,
        kind: 'system',
        permissionCount: data.roles[r].permissions.length,
        people: peopleOn(r),
        customized: Object.keys(data.roles[r].overrides).length > 0,
        updatedAt: null,
        custom: null,
      }),
    ),
    ...data.customRoles.map(
      (r): RoleRow => ({
        id: r.id,
        name: r.name,
        description: r.description ?? '',
        kind: 'custom',
        permissionCount: r.permissions.length,
        people: r.memberCount,
        customized: false,
        updatedAt: r.updatedAt,
        custom: r,
      }),
    ),
  ];

  const needle = q.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (kind === 'all' || (kind === 'custom' ? r.kind === 'custom' : r.kind !== 'custom')) &&
      (!needle || r.name.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle)),
  );

  const reload = async () => {
    setData(await api.get<FarmPermissions>(`/farms/${farm.slug}/permissions`));
    router.refresh();
  };

  const remove = async (role: FarmCustomRole) => {
    setBusy(true);
    try {
      await api.delete(`/farms/${farm.slug}/roles/${role.id}`);
      toast.success(`${role.name} deleted`);
      setDeleting(null);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Roles" description={`The roles people can have on ${farm.name}. Use Give permission to choose what each one can do.`} />

      {!canManage && (
        <p className="mb-4 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You can see these roles but not change them. Ask an owner if something needs to change.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roles…" className="pl-9" aria-label="Search roles" />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Role type">
          <option value="all">All roles</option>
          <option value="system">Built-in</option>
          <option value="custom">Custom</option>
        </Select>
        {canManage && (
          <Button onClick={() => setEditing({ mode: 'create' })}>
            <Plus className="h-4 w-4" /> New role
          </Button>
        )}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Permissions</th>
              <th className="px-5 py-3 text-right font-medium">People</th>
              <th className="px-5 py-3 font-medium">Updated</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((r) => (
              <tr key={r.id} className="align-top hover:bg-muted/30">
                <td className="px-5 py-3">
                  <p className="flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="h-4 w-4 text-primary" /> {r.name}
                  </p>
                  {r.description && <p className="mt-0.5 max-w-sm text-xs text-muted-foreground">{r.description}</p>}
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {r.kind === 'custom' ? <Badge variant="accent">Custom</Badge> : <Badge variant="outline">Built-in</Badge>}
                    {r.customized && <Badge variant="primary">Customized</Badge>}
                  </div>
                </td>
                <td className="px-5 py-3 tabular-nums text-muted-foreground">{r.kind === 'owner' ? 'Everything' : `${r.permissionCount} of ${ROLE_KEY_COUNT}`}</td>
                <td className="px-5 py-3 text-right tabular-nums">{r.people}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{r.updatedAt ? formatDate(r.updatedAt) : '—'}</td>
                <td className="px-5 py-3">
                  {r.kind === 'owner' ? (
                    <Lock className="ml-auto h-4 w-4 text-muted-foreground" aria-label="Owners always have every permission" />
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/farms/${farm.slug}/roles/${r.id}/permissions`} className={cn(buttonClasses('outline', 'sm'), 'whitespace-nowrap')}>
                        <KeyRound className="h-4 w-4" /> {canManage ? 'Give permission' : 'View permissions'}
                      </Link>
                      {r.custom && canManage && (
                        <>
                          <Button size="icon" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditing({ mode: 'edit', role: r.custom! })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Delete ${r.name}`}
                            disabled={r.people > 0}
                            title={r.people > 0 ? 'Give the people with this role another role first' : undefined}
                            onClick={() => setDeleting(r.custom)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                  No roles match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {editing && (
        <RoleDialog
          key={editing.mode === 'edit' ? editing.role.id : 'new'}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Nobody has this role, so no one loses access."
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={busy} onClick={() => deleting && remove(deleting)}>
              Delete role
            </Button>
          </>
        }
      />
    </>
  );
}

/** Create a custom role, or rename one. Permissions are given on the role's permission page. */
function RoleDialog({ editing, onClose, onSaved }: { editing: Exclude<Editing, null>; onClose: () => void; onSaved: () => Promise<void> }) {
  const { farm } = useFarm();
  const role = editing.mode === 'edit' ? editing.role : null;
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setErrors({});
    const body = { name: name.trim(), description: description.trim() };
    try {
      if (role) await api.patch(`/farms/${farm.slug}/roles/${role.id}`, body);
      else await api.post(`/farms/${farm.slug}/roles`, { ...body, permissions: [] });
      toast.success(role ? `${body.name} saved` : `${body.name} created — now give it permissions`);
      await onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? 'Invalid'])));
      else toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={role ? `Edit ${role.name}` : 'New role'}
      description="Name the role here. Choose what it can do with Give permission in the list."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={name.trim().length < 2} onClick={save}>
            {role ? 'Save role' : 'Create role'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field id="role-modal-name" label="Role name" error={errors.name}>
          <Input id="role-modal-name" value={name} maxLength={60} autoFocus placeholder="e.g. Store keeper" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="role-modal-description" label="Description (optional)" error={errors.description}>
          <Input
            id="role-modal-description"
            value={description}
            maxLength={255}
            placeholder="What people with this role do"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
