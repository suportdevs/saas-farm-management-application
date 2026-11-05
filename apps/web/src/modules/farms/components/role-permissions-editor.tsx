'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  modulePermissions,
  PERMISSION_MODULE_KEYS,
  PERMISSION_MODULES,
  ROLE_INFO,
  ROLE_PERMISSIONS,
  type FarmPermissions,
  type FarmRole,
  type Permission,
  type PermissionModule,
} from '@kit/shared';
import { PageHeader } from '@/components/app/page-header';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api';
import { useFarm } from '@/modules/farms/context';
import { Matrix, ROLE_KEY_COUNT, sameSet, useLockReason } from './permissions-manager';

type SystemRole = Exclude<FarmRole, 'owner'>;

/** The role this page gives permissions to: a built-in role, or a custom role by id. */
export type RoleTarget = { kind: 'system'; role: SystemRole } | { kind: 'custom'; id: string };

/**
 * "Give permission" for one role: pick a module, then tick the actions of
 * each of its operations. Changes in every module are saved together.
 */
export function RolePermissionsEditor({ initial, target }: { initial: FarmPermissions; target: RoleTarget }) {
  const router = useRouter();
  const { farm, membership } = useFarm();
  const lockReason = useLockReason();
  const [data, setData] = useState(initial);
  const custom = target.kind === 'custom' ? data.customRoles.find((r) => r.id === target.id) : undefined;
  const system = target.kind === 'system' ? target.role : null;
  const saved: Permission[] = system ? data.roles[system].permissions : (custom?.permissions ?? []);
  const customized = system ? Object.keys(data.roles[system].overrides).length > 0 : false;
  const defaults = system ? ROLE_PERMISSIONS[system] : null;
  const name = system ? ROLE_INFO[system].label : (custom?.name ?? 'Role');

  const [module, setModule] = useState<PermissionModule | ''>('');
  const [draft, setDraft] = useState<Set<Permission>>(() => new Set(saved));
  const [saving, setSaving] = useState(false);

  // Members can't change the role they hold themselves.
  const ownRole = membership.role !== 'owner' && (custom ? membership.customRole?.id === custom.id : !membership.customRole && membership.role === system);
  const editable = membership.permissions.includes('roles.manage') && !ownRole;
  const dirty = !sameSet(draft, saved);
  const countIn = (m: PermissionModule) => modulePermissions(m).filter((p) => draft.has(p)).length;

  const toggle = (key: Permission, on: boolean) =>
    setDraft((d) => {
      const next = new Set(d);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  /** Runs one API call, then reloads the role from the server. */
  const send = async (fn: () => Promise<unknown>, message: string) => {
    setSaving(true);
    try {
      await fn();
      const next = await api.get<FarmPermissions>(`/farms/${farm.slug}/permissions`);
      setData(next);
      const fresh = system ? next.roles[system].permissions : (next.customRoles.find((r) => r.id === custom?.id)?.permissions ?? []);
      setDraft(new Set(fresh));
      toast.success(message);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    const permissions = [...draft];
    if (system) return send(() => api.put(`/farms/${farm.slug}/roles/${system}/permissions`, { permissions }), `${name} permissions saved`);
    return send(() => api.patch(`/farms/${farm.slug}/roles/${custom!.id}`, { permissions }), `${name} permissions saved`);
  };

  return (
    <>
      <Link href={`/farms/${farm.slug}/roles`} className={buttonClasses('ghost', 'sm')}>
        <ArrowLeft className="h-4 w-4" /> Roles
      </Link>
      <PageHeader
        title={`Give permission · ${name}`}
        description={system ? ROLE_INFO[system].description : (custom?.description ?? 'Choose a module, then tick what this role can do in it.')}
      />

      {!editable && (
        <p className="mb-4 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {ownRole ? 'This is your own role, so an owner has to change it.' : 'You can see these permissions but not change them.'}
        </p>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {name}
            {system ? customized ? <Badge variant="primary">Customized for this farm</Badge> : <Badge variant="outline">Default</Badge> : <Badge variant="accent">Custom role</Badge>}
            <Badge variant="outline">
              {draft.size} of {ROLE_KEY_COUNT} permissions
            </Badge>
            {dirty && <span className="text-xs font-normal text-muted-foreground">Unsaved changes</span>}
          </CardTitle>
          <CardDescription>Changes in every module are kept until you save.</CardDescription>
          <div className="mt-3 max-w-sm">
            <Field id="permission-module" label="Module">
              <Select id="permission-module" value={module} onChange={(e) => setModule(e.target.value as PermissionModule | '')}>
                <option value="">Choose a module…</option>
                {PERMISSION_MODULE_KEYS.map((m) => (
                  <option key={m} value={m}>
                    {PERMISSION_MODULES[m].label} ({countIn(m)}/{modulePermissions(m).length})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardHeader>

        {module ? (
          <Matrix
            modules={[module]}
            renderGroupControl={(group, label) => {
              const keys = group.filter((k) => !lockReason(k));
              const on = keys.filter((k) => draft.has(k)).length;
              return (
                <Checkbox
                  aria-label={`All ${label} permissions`}
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
        ) : (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">Choose a module to see its operations and actions.</p>
        )}

        {editable && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
            {system && customized && (
              <Button
                variant="outline"
                className="mr-auto"
                disabled={saving}
                onClick={() => send(() => api.delete(`/farms/${farm.slug}/roles/${system}/permissions`), `${name} is back on the defaults`)}
              >
                <RotateCcw className="h-4 w-4" /> Reset to defaults
              </Button>
            )}
            <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(new Set(saved))}>
              Discard
            </Button>
            <Button loading={saving} disabled={!dirty} onClick={save}>
              Save permissions
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
