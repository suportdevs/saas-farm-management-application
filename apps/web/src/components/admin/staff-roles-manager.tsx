'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Lock, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PLATFORM_PERMISSION_LABELS, PLATFORM_PERMISSIONS, type PlatformPermission, type PlatformRole } from '@kit/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Permission groups, in the order the operator console shows them. */
const GROUPS: { label: string; prefix: string }[] = [
  { label: 'Stats', prefix: 'platform.stats.' },
  { label: 'Users', prefix: 'platform.users.' },
  { label: 'Tenants', prefix: 'platform.tenants.' },
  { label: 'Billing', prefix: 'platform.billing.' },
  { label: 'Audit', prefix: 'platform.audit.' },
  { label: 'Staff', prefix: 'platform.staff.' },
];

type Editing = { mode: 'create' } | { mode: 'edit'; role: PlatformRole } | null;

/**
 * Staff roles: built-in ones are read-only templates; custom ones are created,
 * edited and deleted here. A role can't be deleted while staff hold it.
 */
export function StaffRolesManager({ roles, myPermissions, myRole }: { roles: PlatformRole[]; myPermissions: PlatformPermission[]; myRole: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<PlatformRole | null>(null);
  const [busy, setBusy] = useState(false);
  const custom = roles.filter((r) => !r.system);
  const system = roles.filter((r) => r.system);

  const remove = async (role: PlatformRole) => {
    setBusy(true);
    try {
      await api.delete(`/admin/staff-roles/${role.key}`);
      toast.success(`${role.name} deleted`);
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          What each kind of platform staff can do in the operator console. Built-in roles can&apos;t be changed — create a custom role for anything else.
          Assign roles on a user&apos;s page.
        </p>
        <Button onClick={() => setEditing({ mode: 'create' })}>
          <Plus className="h-4 w-4" /> New staff role
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Custom roles</h2>
        {custom.length === 0 ? (
          <Card className="px-6 py-8 text-center text-sm text-muted-foreground">No custom staff roles yet.</Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {custom.map((r) => (
              <RoleCard
                key={r.key}
                role={r}
                actions={
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditing({ mode: 'edit', role: r })} disabled={r.key === myRole}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => setDeleting(r)}
                      disabled={r.userCount > 0}
                      title={r.userCount > 0 ? 'Give the staff with this role another role first' : undefined}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Built-in roles</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {system.map((r) => (
            <RoleCard key={r.key} role={r} actions={<Lock className="h-4 w-4 text-muted-foreground" aria-label="Built-in role" />} />
          ))}
        </div>
      </section>

      {editing && (
        <RoleDialog
          key={editing.mode === 'edit' ? editing.role.key : 'new'}
          editing={editing}
          myPermissions={myPermissions}
          superAdmin={myRole === 'super_admin'}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="The role is removed for good. Nobody holds it, so no one loses access."
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
    </div>
  );
}

function RoleCard({ role, actions }: { role: PlatformRole; actions: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" /> {role.name}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{role.key}</code>
            </CardTitle>
            {role.description && <CardDescription className="mt-1">{role.description}</CardDescription>}
          </div>
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Badge variant="outline">
          {role.userCount} staff · {role.permissions.length} of {PLATFORM_PERMISSIONS.length} permissions
        </Badge>
        <div className="flex flex-wrap gap-1.5">
          {role.permissions.map((p) => (
            <span key={p} className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary" title={p}>
              {PLATFORM_PERMISSION_LABELS[p]}
            </span>
          ))}
          {role.permissions.length === 0 && <span className="text-xs text-muted-foreground">No permissions</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function RoleDialog({
  editing,
  myPermissions,
  superAdmin,
  onClose,
  onSaved,
}: {
  editing: Exclude<Editing, null>;
  myPermissions: PlatformPermission[];
  superAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const role = editing.mode === 'edit' ? editing.role : null;
  const [name, setName] = useState(role?.name ?? '');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissions, setPermissions] = useState<Set<PlatformPermission>>(new Set(role?.permissions ?? []));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Nobody grants what they don't hold.
  const grantable = (p: PlatformPermission) => superAdmin || myPermissions.includes(p);

  const toggle = (p: PlatformPermission, on: boolean) =>
    setPermissions((s) => {
      const next = new Set(s);
      if (on) next.add(p);
      else next.delete(p);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setErrors({});
    const body = { name: name.trim(), description: description.trim(), permissions: [...permissions] };
    try {
      if (role) await api.patch(`/admin/staff-roles/${role.key}`, body);
      else await api.post('/admin/staff-roles', { ...body, ...(key.trim() ? { key: key.trim() } : {}) });
      toast.success(role ? `${body.name} saved` : `${body.name} created`);
      onSaved();
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
      className="max-w-2xl"
      title={role ? `Edit ${role.name}` : 'New staff role'}
      description="Choose exactly what staff with this role can do in the operator console."
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="staff-role-name" label="Name" error={errors.name}>
            <Input id="staff-role-name" value={name} maxLength={60} autoFocus placeholder="e.g. Tenant ops" onChange={(e) => setName(e.target.value)} />
          </Field>
          {role ? (
            <Field id="staff-role-key" label="Key" hint="Keys never change.">
              <Input id="staff-role-key" value={role.key} disabled />
            </Field>
          ) : (
            <Field id="staff-role-key" label="Key (optional)" error={errors.key} hint="Defaults to the name, e.g. tenant-ops.">
              <Input id="staff-role-key" value={key} maxLength={40} placeholder="tenant-ops" onChange={(e) => setKey(e.target.value.toLowerCase())} />
            </Field>
          )}
        </div>
        <Field id="staff-role-description" label="Description (optional)" error={errors.description}>
          <Input id="staff-role-description" value={description} maxLength={255} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Permissions</legend>
          {GROUPS.map((g) => {
            const keys = PLATFORM_PERMISSIONS.filter((p) => p.startsWith(g.prefix));
            return (
              <div key={g.prefix} className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {keys.map((p) => (
                    <label
                      key={p}
                      className={cn('flex items-start gap-2 text-sm', !grantable(p) && 'cursor-not-allowed opacity-50')}
                      title={grantable(p) ? p : "You can't grant a permission you don't have"}
                    >
                      <Checkbox className="mt-0.5" checked={permissions.has(p)} disabled={!grantable(p)} onChange={(e) => toggle(p, e.target.checked)} />
                      <span>
                        {PLATFORM_PERMISSION_LABELS[p]}
                        <code className="block text-[11px] text-muted-foreground">{p}</code>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </fieldset>
      </div>
    </Dialog>
  );
}
