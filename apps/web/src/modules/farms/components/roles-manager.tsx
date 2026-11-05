'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Eye, Lock, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  FARM_ROLES,
  PERMISSION_MODULES,
  ROLE_INFO,
  ROLE_PERMISSIONS,
  type FarmCustomRole,
  type FarmPermissions,
  type FarmRole,
  type Permission,
} from '@kit/shared';
import { PageHeader } from '@/components/app/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ApiError, api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useFarm } from '@/modules/farms/context';
import { Matrix, moduleKeys, ROLE_KEY_COUNT, sameSet, useLockReason } from './permissions-manager';

type SystemRole = Exclude<FarmRole, 'owner'>;
const SYSTEM_ROLES = FARM_ROLES.filter((r): r is SystemRole => r !== 'owner');

/** What the modal is open for. */
type Editing = { kind: 'system'; role: SystemRole } | { kind: 'custom'; role: FarmCustomRole } | { kind: 'new' } | null;

/** One row of the list: built-in and custom roles side by side. */
interface RoleRow {
  id: string;
  name: string;
  description: string;
  kind: 'owner' | 'system' | 'custom';
  permissionCount: number;
  people: number;
  customized: boolean;
  updatedAt: string | null;
  open: Exclude<Editing, null> | null;
}

/**
 * Roles as a list: search, create / edit in a modal, delete custom roles.
 * Built-in roles can have their permissions changed for this farm; the owner
 * role always has everything.
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
      open: null,
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
        open: { kind: 'system', role: r },
      }),
    ),
    ...data.customRoles.map(
      (r): RoleRow => ({
        id: `custom:${r.id}`,
        name: r.name,
        description: r.description ?? '',
        kind: 'custom',
        permissionCount: r.permissions.length,
        people: r.memberCount,
        customized: false,
        updatedAt: r.updatedAt,
        open: { kind: 'custom', role: r },
      }),
    ),
  ];

  const needle = q.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (kind === 'all' || (kind === 'custom' ? r.kind === 'custom' : r.kind !== 'custom')) &&
      (!needle || r.name.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle)),
  );

  /** Members can't edit the role they hold themselves. */
  const isOwnRole = (open: Exclude<Editing, null>) => {
    if (membership.role === 'owner') return false;
    if (open.kind === 'custom') return membership.customRole?.id === open.role.id;
    if (open.kind === 'system') return !membership.customRole && membership.role === open.role;
    return false;
  };

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
      <PageHeader title="Roles" description={`The roles people can have on ${farm.name} and what each one is allowed to do.`} />

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
          <Button onClick={() => setEditing({ kind: 'new' })}>
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
              <th className="w-24 px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((r) => {
              const own = r.open ? isOwnRole(r.open) : false;
              const editable = canManage && !own;
              return (
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
                  <td className="px-5 py-3 tabular-nums text-muted-foreground">
                    {r.kind === 'owner' ? 'Everything' : `${r.permissionCount} of ${ROLE_KEY_COUNT}`}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.people}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{r.updatedAt ? formatDate(r.updatedAt) : '—'}</td>
                  <td className="px-5 py-3">
                    {!r.open ? (
                      <Lock className="ml-auto h-4 w-4 text-muted-foreground" aria-label="Owners always have every permission" />
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`${editable ? 'Edit' : 'View'} ${r.name}`}
                          title={own ? 'This is your own role, so an owner has to change it' : undefined}
                          onClick={() => setEditing(r.open)}
                        >
                          {editable ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        {r.open.kind === 'custom' && canManage && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Delete ${r.name}`}
                            disabled={r.people > 0}
                            title={r.people > 0 ? 'Give the people with this role another role first' : undefined}
                            onClick={() => r.open?.kind === 'custom' && setDeleting(r.open.role)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
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
          key={editing.kind === 'new' ? 'new' : editing.kind === 'custom' ? editing.role.id : editing.role}
          editing={editing}
          data={data}
          editable={canManage && !isOwnRole(editing)}
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

/** Create a custom role, or edit a custom or built-in role's permissions. */
function RoleDialog({
  editing,
  data,
  editable,
  onClose,
  onSaved,
}: {
  editing: Exclude<Editing, null>;
  data: FarmPermissions;
  editable: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { farm } = useFarm();
  const lockReason = useLockReason();
  const system = editing.kind === 'system' ? editing.role : null;
  const custom = editing.kind === 'custom' ? editing.role : null;
  const saved: Permission[] = system ? data.roles[system].permissions : (custom?.permissions ?? []);
  const defaults = system ? ROLE_PERMISSIONS[system] : null;
  const customized = system ? Object.keys(data.roles[system].overrides).length > 0 : false;

  const [draft, setDraft] = useState<Set<Permission>>(() => new Set(saved));
  const [name, setName] = useState(custom?.name ?? '');
  const [description, setDescription] = useState(custom?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const title = system ? ROLE_INFO[system].label : (custom?.name ?? 'New role');
  const dirty = !sameSet(draft, saved) || (!system && (name.trim() !== (custom?.name ?? '') || description.trim() !== (custom?.description ?? '')));
  const canSave = editable && (system ? dirty : name.trim().length >= 2 && dirty);

  const toggle = (key: Permission, on: boolean) =>
    setDraft((d) => {
      const next = new Set(d);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  /** Runs one API call, then closes the modal and reloads the list. */
  const send = async (fn: () => Promise<unknown>, message: string) => {
    setSaving(true);
    setErrors({});
    try {
      await fn();
      toast.success(message);
      await onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? 'Invalid'])));
      else toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    const permissions = [...draft];
    if (system) return send(() => api.put(`/farms/${farm.slug}/roles/${system}/permissions`, { permissions }), `${title} permissions saved`);
    const body = { name: name.trim(), description: description.trim(), permissions };
    if (custom) return send(() => api.patch(`/farms/${farm.slug}/roles/${custom.id}`, body), `${body.name} saved`);
    return send(() => api.post(`/farms/${farm.slug}/roles`, body), `${body.name} created`);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      className="max-w-5xl"
      title={editing.kind === 'new' ? 'New role' : editable ? `Edit ${title}` : title}
      description={
        <>
          {system ? ROLE_INFO[system].description : 'A role you define: pick exactly which actions it can take.'} {draft.size} of {ROLE_KEY_COUNT} action keys.
        </>
      }
      footer={
        <>
          {system && customized && editable && (
            <Button
              variant="outline"
              className="mr-auto"
              disabled={saving}
              onClick={() => send(() => api.delete(`/farms/${farm.slug}/roles/${system}/permissions`), `${title} is back on the defaults`)}
            >
              <RotateCcw className="h-4 w-4" /> Reset to defaults
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {editable ? 'Cancel' : 'Close'}
          </Button>
          {editable && (
            <Button loading={saving} disabled={!canSave} onClick={save}>
              {editing.kind === 'new' ? 'Create role' : 'Save role'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {!system && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="role-modal-name" label="Role name" error={errors.name}>
              <Input
                id="role-modal-name"
                value={name}
                maxLength={60}
                autoFocus
                placeholder="e.g. Milker"
                disabled={!editable}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field id="role-modal-description" label="Description (optional)" error={errors.description}>
              <Input
                id="role-modal-description"
                value={description}
                maxLength={255}
                placeholder="What people with this role do"
                disabled={!editable}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </div>
        )}
        {errors.permissions && <p className="text-sm text-destructive">{errors.permissions}</p>}

        <div className="overflow-hidden rounded-lg border">
          <Matrix
            renderRowControl={(m) => {
              const keys = moduleKeys(m).filter((k) => !lockReason(k));
              const on = keys.filter((k) => draft.has(k)).length;
              return (
                <Checkbox
                  aria-label={`All ${PERMISSION_MODULES[m].label} actions`}
                  checked={keys.length > 0 && on === keys.length}
                  ref={(el) => {
                    if (el) el.indeterminate = on > 0 && on < keys.length;
                  }}
                  disabled={!editable || keys.length === 0}
                  onChange={(e) => keys.forEach((k) => toggle(k, e.target.checked))}
                />
              );
            }}
            renderCell={(key) => {
              const reason = lockReason(key);
              const changedFromDefault = defaults !== null && draft.has(key) !== defaults.includes(key);
              return (
                <span className="relative inline-flex" title={reason ?? (changedFromDefault ? 'Changed from the role default' : key)}>
                  <Checkbox aria-label={key} checked={draft.has(key)} disabled={!editable || Boolean(reason)} onChange={(e) => toggle(key, e.target.checked)} />
                  {changedFromDefault && <span className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-primary" />}
                </span>
              );
            }}
          />
        </div>

        {system && (
          <p className="text-xs text-muted-foreground">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" /> differs from the built-in default for this role.
          </p>
        )}
        {custom && custom.memberCount > 0 && (
          <p className="text-xs text-muted-foreground">Changes apply immediately to everyone with this role.</p>
        )}
      </div>
    </Dialog>
  );
}
