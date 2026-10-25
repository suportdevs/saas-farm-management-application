'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent } from 'react';
import { Download, FileDown, FileUp, Lock, Pencil, Plus, Search, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PLATFORM_PERMISSION_LABELS, PLATFORM_PERMISSIONS, STAFF_ROLE_IMPORT_LIMIT, type PlatformPermission, type PlatformRole } from '@kit/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ApiError, api, errorMessage } from '@/lib/api';
import { downloadFile, parseCsvObjects, toCsv } from '@/lib/csv';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Permission groups, in the order the operator console shows them. */
const GROUPS: { label: string; prefix: string }[] = [
  { label: 'Stats', prefix: 'platform.stats.' },
  { label: 'Users', prefix: 'platform.users.' },
  { label: 'Tenants', prefix: 'platform.tenants.' },
  { label: 'Billing', prefix: 'platform.billing.' },
  { label: 'Plans', prefix: 'platform.plans.' },
  { label: 'Audit', prefix: 'platform.audit.' },
  { label: 'Staff', prefix: 'platform.staff.' },
];

type Editing = { mode: 'create' } | { mode: 'edit'; role: PlatformRole } | null;

const CSV_HEADERS = ['key', 'name', 'description', 'permissions'];

/** permissions are space-separated keys in one cell; built-in rows are exported for reference but skipped on import. */
const toCsvRows = (roles: PlatformRole[]) => roles.map((r) => [r.key, r.name, r.description ?? '', r.permissions.join(' ')]);

function downloadTemplate() {
  downloadFile(
    'staff-roles-import-template.csv',
    toCsv(CSV_HEADERS, [
      ['tenant-ops', 'Tenant ops', 'Looks after tenants day to day', 'platform.stats.view platform.tenants.view platform.tenants.suspend'],
      ['finance-desk', 'Finance desk', 'Manual invoices and payments', 'platform.tenants.view platform.billing.view platform.billing.manage'],
    ]),
  );
}

/**
 * Staff roles as a list: search, create / edit in a modal, delete, CSV
 * import (all or nothing), export and an import template. Built-in roles are
 * listed read-only.
 */
export function StaffRolesManager({ roles, myPermissions, myRole }: { roles: PlatformRole[]; myPermissions: PlatformPermission[]; myRole: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<PlatformRole | null>(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'custom' | 'system'>('all');

  const needle = q.trim().toLowerCase();
  const visible = roles.filter(
    (r) =>
      (kind === 'all' || (kind === 'system') === r.system) &&
      (!needle || [r.key, r.name, r.description ?? '', ...r.permissions].some((v) => v.toLowerCase().includes(needle))),
  );

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
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        What each kind of platform staff can do in the operator console. Built-in roles can&apos;t be changed — create a custom role for anything else, then
        assign it on a user&apos;s page.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search key, name or permission…" className="pl-9" aria-label="Search roles" />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Role type">
          <option value="all">All roles</option>
          <option value="custom">Custom</option>
          <option value="system">Built-in</option>
        </Select>
        <Button variant="outline" onClick={downloadTemplate}>
          <FileDown className="h-4 w-4" /> Template
        </Button>
        <Button variant="outline" onClick={() => setImporting(true)}>
          <Upload className="h-4 w-4" /> Import
        </Button>
        <Button variant="outline" onClick={() => downloadFile(`staff-roles-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(CSV_HEADERS, toCsvRows(visible)))}>
          <Download className="h-4 w-4" /> Export
        </Button>
        <Button onClick={() => setEditing({ mode: 'create' })}>
          <Plus className="h-4 w-4" /> New staff role
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Permissions</th>
              <th className="px-5 py-3 text-right font-medium">Staff</th>
              <th className="px-5 py-3 font-medium">Updated</th>
              <th className="w-24 px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((r) => (
              <tr key={r.key} className="align-top hover:bg-muted/30">
                <td className="px-5 py-3">
                  <p className="flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="h-4 w-4 text-primary" /> {r.name}
                  </p>
                  <code className="text-xs text-muted-foreground">{r.key}</code>
                  {r.description && <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">{r.description}</p>}
                </td>
                <td className="px-5 py-3">{r.system ? <Badge variant="outline">Built-in</Badge> : <Badge variant="accent">Custom</Badge>}</td>
                <td className="px-5 py-3">
                  <div className="flex max-w-md flex-wrap gap-1">
                    {r.permissions.length === PLATFORM_PERMISSIONS.length ? (
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">Everything</span>
                    ) : r.permissions.length === 0 ? (
                      <span className="text-xs text-muted-foreground">None</span>
                    ) : (
                      r.permissions.map((p) => (
                        <span key={p} className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary" title={p}>
                          {PLATFORM_PERMISSION_LABELS[p]}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">{r.userCount}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{r.updatedAt ? formatDate(r.updatedAt) : '—'}</td>
                <td className="px-5 py-3">
                  {r.system ? (
                    <Lock className="ml-auto h-4 w-4 text-muted-foreground" aria-label="Built-in role" />
                  ) : (
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Edit ${r.name}`} disabled={r.key === myRole} onClick={() => setEditing({ mode: 'edit', role: r })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${r.name}`}
                        disabled={r.userCount > 0}
                        title={r.userCount > 0 ? 'Give the staff with this role another role first' : undefined}
                        onClick={() => setDeleting(r)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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

      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
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

/** "rows.3.key" → "Line 5 · key: …" (line 1 is the header). */
const describeErrors = (details: Record<string, string[]>) =>
  Object.entries(details).map(([path, messages]) => {
    const [, index, column] = path.match(/^rows\.(\d+)\.?(.*)$/) ?? [];
    const where = index !== undefined ? `Line ${Number(index) + 2}${column ? ` · ${column}` : ''}` : path;
    return `${where}: ${messages.join(', ')}`;
  });

function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<{ name: string; rows: Record<string, string>[] } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    setFile(null);
    setErrors([]);
    if (!picked) return;
    const { headers, rows } = parseCsvObjects(await picked.text());
    const missing = ['key', 'name'].filter((h) => !headers.includes(h));
    if (missing.length) return setErrors([`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template to see the format.`]);
    if (!rows.length) return setErrors(['The file has no rows.']);
    if (rows.length > STAFF_ROLE_IMPORT_LIMIT) return setErrors([`Up to ${STAFF_ROLE_IMPORT_LIMIT} rows per import.`]);
    setFile({ name: picked.name, rows });
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setErrors([]);
    try {
      const rows = file.rows.map((r) => ({ key: r.key ?? '', name: r.name ?? '', description: r.description ?? '', permissions: r.permissions ?? '' }));
      const { created, updated } = await api.post<{ created: number; updated: number }>('/admin/staff-roles/import', { rows });
      toast.success(`Imported: ${created} created, ${updated} updated`);
      onImported();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(describeErrors(err.details));
      else setErrors([errorMessage(err)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Import staff roles"
      description="CSV with key, name, description and permissions (space-separated keys). Existing custom keys are updated; nothing is saved unless every row is valid."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!file} onClick={submit}>
            <Upload className="h-4 w-4" /> Import {file ? `${file.rows.length} rows` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center text-sm hover:bg-muted/40">
          <FileUp className="h-6 w-6 text-muted-foreground" />
          <span className="font-medium">{file ? file.name : 'Choose a CSV file'}</span>
          <span className="text-xs text-muted-foreground">{file ? `${file.rows.length} rows ready` : `Up to ${STAFF_ROLE_IMPORT_LIMIT} rows`}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} />
        </label>
        <Button variant="link" onClick={downloadTemplate}>
          <FileDown className="h-4 w-4" /> Download the import template
        </Button>
        {errors.length > 0 && (
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
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
