'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { Check, Lock, Minus, Plus, RotateCcw, Save, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  FARM_ROLES,
  isOwnerOnly,
  PERMISSION_ACTION_LABELS,
  PERMISSION_MODULE_KEYS,
  PERMISSION_MODULES,
  resolvePermissions,
  ROLE_INFO,
  roleLabel,
  ROLE_PERMISSIONS,
  type FarmMember,
  type FarmPermissions,
  type FarmRole,
  type Permission,
  type PermissionAction,
  type PermissionModule,
  type PermissionOverrides,
} from '@kit/shared';
import { PageHeader } from '@/components/app/page-header';
import { Avatar } from '@/components/app/user-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api';
import { useFarm } from '@/modules/farms/context';
import { cn } from '@/lib/utils';

const EDITABLE_ROLES = FARM_ROLES.filter((r) => r !== 'owner');

/** Matrix columns: every action some module uses, in label order. */
const ACTIONS = (Object.keys(PERMISSION_ACTION_LABELS) as PermissionAction[]).filter((a) =>
  PERMISSION_MODULE_KEYS.some((m) => (PERMISSION_MODULES[m].actions as readonly PermissionAction[]).includes(a)),
);

const keyOf = (m: PermissionModule, a: PermissionAction) => `${m}.${a}` as Permission;
const hasAction = (m: PermissionModule, a: PermissionAction) => (PERMISSION_MODULES[m].actions as readonly PermissionAction[]).includes(a);
const moduleKeys = (m: PermissionModule) => PERMISSION_MODULES[m].actions.map((a) => keyOf(m, a as PermissionAction));

/**
 * Roles & permissions: what each role can do on this farm (role-based keys,
 * one per action), and per-member module overrides that allow or deny single
 * action keys on top of the member's role.
 */
export function PermissionsManager({
  initial,
  members,
  currentUserId,
}: {
  initial: FarmPermissions;
  members: FarmMember[];
  currentUserId: string;
}) {
  const { farm, membership } = useFarm();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<'roles' | 'members'>('roles');
  const canManage = membership.permissions.includes('roles.manage');

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description={`Choose exactly what each role can do on ${farm.name}, then fine-tune single members with overrides.`}
      />

      <div role="tablist" aria-label="Permission views" className="mb-6 inline-flex rounded-lg border bg-card p-1">
        {(
          [
            ['roles', 'Roles', ShieldCheck],
            ['members', 'Member overrides', Users],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {!canManage && (
        <p className="mb-4 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You can see these permissions but not change them. Ask an owner if something needs to change.
        </p>
      )}

      {tab === 'roles' ? (
        <RoleEditor data={data} onSaved={setData} canManage={canManage} />
      ) : (
        <MemberOverrides data={data} onSaved={setData} canManage={canManage} members={members} currentUserId={currentUserId} />
      )}
    </>
  );
}

// ─── Shared pieces ───────────────────────────────────────────────

/** Why the signed-in member can't change `key` (null when they can). */
function useLockReason() {
  const { membership } = useFarm();
  return (key: Permission): string | null => {
    if (isOwnerOnly(key)) return 'Only owners have this';
    if (membership.role !== 'owner' && !membership.permissions.includes(key)) return "You can't hand out a permission you don't have";
    return null;
  };
}

function Matrix({ renderCell, renderRowControl }: { renderCell: (key: Permission) => ReactNode; renderRowControl?: (m: PermissionModule) => ReactNode }) {
  const { modules } = useFarm();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Module</th>
            {renderRowControl && <th className="px-2 py-3 font-medium">All actions</th>}
            {ACTIONS.map((a) => (
              <th key={a} className="px-2 py-3 text-center font-medium">
                {PERMISSION_ACTION_LABELS[a]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {PERMISSION_MODULE_KEYS.map((m) => (
            <tr key={m} className="hover:bg-muted/20">
              <th scope="row" className="whitespace-nowrap px-4 py-2.5 font-medium">
                {PERMISSION_MODULES[m].label}
                <span className="block text-xs font-normal text-muted-foreground">{m}.*</span>
                {modules[m] !== 'enabled' && (
                  <Badge
                    variant={modules[m] === 'plan' ? 'warning' : 'default'}
                    className="mt-1"
                    title={modules[m] === 'plan' ? 'Saved, but has no effect until the plan includes this module' : 'Switched off in farm settings'}
                  >
                    {modules[m] === 'plan' ? 'Not in plan' : 'Switched off'}
                  </Badge>
                )}
              </th>
              {renderRowControl && <td className="px-2 py-2">{renderRowControl(m)}</td>}
              {ACTIONS.map((a) => (
                <td key={a} className="px-2 py-2 text-center">
                  {hasAction(m, a) ? renderCell(keyOf(m, a)) : <span className="text-muted-foreground/40">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Footer({ dirty, saving, onSave, onDiscard, extra }: { dirty: boolean; saving: boolean; onSave: () => void; onDiscard: () => void; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
      {extra}
      <span className="flex-1" />
      {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      <Button variant="ghost" onClick={onDiscard} disabled={!dirty || saving}>
        Discard
      </Button>
      <Button onClick={onSave} disabled={!dirty} loading={saving}>
        {!saving && <Save className="h-4 w-4" />} Save
      </Button>
    </div>
  );
}

const sameSet = (a: Iterable<Permission>, b: Iterable<Permission>) => {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((k) => y.has(k));
};

// ─── Roles ───────────────────────────────────────────────────────

/** The role being edited: a system role key, `custom:<id>`, or `new` for a role being created. */
type RoleSelection = Exclude<FarmRole, 'owner'> | `custom:${string}` | 'new';

const ROLE_KEY_COUNT = PERMISSION_MODULE_KEYS.reduce((n, m) => n + moduleKeys(m).length, 0);

function RoleEditor({ data, onSaved, canManage }: { data: FarmPermissions; onSaved: (d: FarmPermissions) => void; canManage: boolean }) {
  const router = useRouter();
  const { farm, membership } = useFarm();
  const lockReason = useLockReason();
  const [selection, setSelection] = useState<RoleSelection>('manager');
  const custom = selection.startsWith('custom:') ? data.customRoles.find((r) => `custom:${r.id}` === selection) : undefined;
  const system = !custom && selection !== 'new' ? (selection as Exclude<FarmRole, 'owner'>) : null;
  const saved: Permission[] = system ? data.roles[system].permissions : (custom?.permissions ?? []);

  const [draft, setDraft] = useState<Set<Permission>>(() => new Set(saved));
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Members can't edit the role they hold themselves.
  const ownRole =
    membership.role !== 'owner' &&
    (custom ? membership.customRole?.id === custom.id : system !== null && !membership.customRole && membership.role === system);
  const editable = canManage && !ownRole;
  const savedName = custom?.name ?? '';
  const savedDescription = custom?.description ?? '';
  const dirty = !sameSet(draft, saved) || (system === null && (name.trim() !== savedName || description.trim() !== savedDescription));
  const customized = system ? Object.keys(data.roles[system].overrides).length > 0 : false;
  const defaults = system ? ROLE_PERMISSIONS[system] : null;
  const title = system ? ROLE_INFO[system].label : (custom?.name ?? 'New role');

  const pick = (next: RoleSelection, d = data) => {
    setSelection(next);
    setConfirmDelete(false);
    const c = next.startsWith('custom:') ? d.customRoles.find((r) => `custom:${r.id}` === next) : undefined;
    setDraft(new Set(next === 'new' ? [] : c ? c.permissions : d.roles[next as Exclude<FarmRole, 'owner'>].permissions));
    setName(c?.name ?? '');
    setDescription(c?.description ?? '');
  };

  const toggle = (key: Permission, on: boolean) =>
    setDraft((d) => {
      const next = new Set(d);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  /** Runs a change, reloads the editor data and selects `then` (default: stay). */
  const send = async (fn: () => Promise<unknown>, message: string, then?: (d: FarmPermissions, result: unknown) => RoleSelection) => {
    setSaving(true);
    try {
      const result = await fn();
      const next = await api.get<FarmPermissions>(`/farms/${farm.slug}/permissions`);
      onSaved(next);
      pick(then ? then(next, result) : selection, next);
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
    if (system) {
      return send(() => api.put(`/farms/${farm.slug}/roles/${system}/permissions`, { permissions }), `${title} permissions saved`);
    }
    const body = { name: name.trim(), description: description.trim(), permissions };
    if (custom) return send(() => api.patch(`/farms/${farm.slug}/roles/${custom.id}`, body), `${body.name} saved`);
    return send(
      () => api.post<{ role: { id: string } }>(`/farms/${farm.slug}/roles`, body),
      `${body.name} created`,
      (_d, result) => `custom:${(result as { role: { id: string } }).role.id}`,
    );
  };

  const chip = (value: RoleSelection, label: ReactNode, dot = false) => (
    <button
      key={value}
      type="button"
      onClick={() => pick(value)}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
        selection === value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
      )}
    >
      {label}
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', selection === value ? 'bg-primary-foreground' : 'bg-primary')} aria-label="customized" />}
    </button>
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b pb-4">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">System roles</p>
        <div className="flex flex-wrap gap-1.5">
          {EDITABLE_ROLES.map((r) => chip(r, ROLE_INFO[r].label, Object.keys(data.roles[r].overrides).length > 0))}
          <span className="flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-sm text-muted-foreground" title="Owners always have every permission">
            <Lock className="h-3.5 w-3.5" /> Owner
          </span>
        </div>
        <p className="mb-1.5 mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Custom roles</p>
        <div className="flex flex-wrap gap-1.5">
          {data.customRoles.map((r) =>
            chip(
              `custom:${r.id}`,
              <>
                {r.name}
                <span className={cn('text-xs', selection === `custom:${r.id}` ? 'opacity-80' : 'text-muted-foreground')}>{r.memberCount}</span>
              </>,
            ),
          )}
          {canManage &&
            chip(
              'new',
              <>
                <Plus className="h-3.5 w-3.5" /> New role
              </>,
            )}
          {!canManage && data.customRoles.length === 0 && <span className="text-sm text-muted-foreground">None yet.</span>}
        </div>

        <CardTitle className="mt-5 flex flex-wrap items-center gap-2 text-base">
          {title}
          {system && (customized ? <Badge variant="primary">Customized for this farm</Badge> : <Badge variant="outline">Default</Badge>)}
          {custom && <Badge variant="accent">Custom role</Badge>}
          {custom && (
            <Badge variant="outline">
              {custom.memberCount} {custom.memberCount === 1 ? 'person' : 'people'}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {system ? ROLE_INFO[system].description : 'A role you define: pick exactly which actions it can take.'} {draft.size} of {ROLE_KEY_COUNT} action
          keys.
          {ownRole && ' This is your own role, so an owner has to change it.'}
        </CardDescription>

        {system === null && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="role-name" label="Role name">
              <Input id="role-name" value={name} maxLength={60} placeholder="e.g. Milker" disabled={!editable} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field id="role-description" label="Description (optional)">
              <Input
                id="role-description"
                value={description}
                maxLength={255}
                placeholder="What people with this role do"
                disabled={!editable}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </div>
        )}
      </CardHeader>

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

      {editable && (
        <Footer
          dirty={selection === 'new' ? name.trim().length >= 2 : dirty}
          saving={saving}
          onDiscard={() => pick(selection)}
          onSave={save}
          extra={
            <>
              {customized && system && (
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => send(() => api.delete(`/farms/${farm.slug}/roles/${system}/permissions`), `${title} is back on the defaults`)}
                >
                  <RotateCcw className="h-4 w-4" /> Reset to defaults
                </Button>
              )}
              {custom &&
                (confirmDelete ? (
                  <>
                    <span className="text-sm text-muted-foreground">Delete {custom.name}?</span>
                    <Button
                      variant="destructive"
                      loading={saving}
                      onClick={() => send(() => api.delete(`/farms/${farm.slug}/roles/${custom.id}`), `${custom.name} deleted`, () => 'manager')}
                    >
                      Delete
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                      Keep
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    className="text-destructive"
                    disabled={saving || custom.memberCount > 0}
                    title={custom.memberCount > 0 ? 'Give the people with this role another role first' : undefined}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete role
                  </Button>
                ))}
            </>
          }
        />
      )}
      {system && (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" /> differs from the built-in default for this role. New
          permissions added later follow the defaults unless you change them here.
        </p>
      )}
      {custom && custom.memberCount > 0 && (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          Changes apply immediately to everyone with this role. To delete it, give them another role on the Team page first.
        </p>
      )}
    </Card>
  );
}

// ─── Member overrides ────────────────────────────────────────────

type CellState = 'inherit' | 'allow' | 'deny';
const NEXT_STATE: Record<CellState, CellState> = { inherit: 'allow', allow: 'deny', deny: 'inherit' };
const stateOf = (overrides: PermissionOverrides, key: Permission): CellState =>
  overrides[key] === undefined ? 'inherit' : overrides[key] ? 'allow' : 'deny';

function MemberOverrides({
  data,
  onSaved,
  canManage,
  members,
  currentUserId,
}: {
  data: FarmPermissions;
  onSaved: (d: FarmPermissions) => void;
  canManage: boolean;
  members: FarmMember[];
  currentUserId: string;
}) {
  const router = useRouter();
  const { farm } = useFarm();
  const lockReason = useLockReason();
  const byId = useMemo(() => new Map(data.members.map((m) => [m.userId, m])), [data]);
  const people = members.filter((m) => m.role !== 'owner');
  const [selectedId, setSelectedId] = useState(people.find((m) => m.userId !== currentUserId)?.userId ?? people[0]?.userId ?? null);
  const selected = people.find((m) => m.userId === selectedId) ?? null;
  const saved = (selected && byId.get(selected.userId)?.overrides) || {};
  const [draft, setDraft] = useState<PermissionOverrides>(saved);
  const [saving, setSaving] = useState(false);

  if (!selected) {
    return (
      <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
        Only owners are on this farm, and owners always have every permission. Invite your team to set member overrides.
      </Card>
    );
  }

  const self = selected.userId === currentUserId;
  const editable = canManage && !self;
  // A custom role replaces the system role as the base the overrides apply to.
  const customBase = selected.customRole ? data.customRoles.find((r) => r.id === selected.customRole!.id)?.permissions : undefined;
  const roleBase = customBase ?? data.roles[selected.role].permissions;
  const effective = new Set(
    resolvePermissions(selected.role, { roleOverrides: data.roles[selected.role].overrides, memberOverrides: draft, customRole: customBase }),
  );
  const overrideCount = Object.keys(draft).length;
  const dirty = JSON.stringify(Object.entries(draft).sort()) !== JSON.stringify(Object.entries(saved).sort());

  const choose = (id: string) => {
    setSelectedId(id);
    setDraft(byId.get(id)?.overrides ?? {});
  };

  const setState = (keys: Permission[], state: CellState) =>
    setDraft((d) => {
      const next = { ...d };
      for (const k of keys) {
        if (state === 'inherit') delete next[k];
        else next[k] = state === 'allow';
      }
      return next;
    });

  const save = async (overrides: PermissionOverrides) => {
    setSaving(true);
    try {
      const next = await api.put<FarmPermissions>(`/farms/${farm.slug}/members/${selected.userId}/permissions`, { overrides });
      onSaved(next);
      setDraft(next.members.find((m) => m.userId === selected.userId)?.overrides ?? {});
      toast.success(`Permissions for ${selected.name} saved`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[18rem_1fr]">
      <Card className="h-fit overflow-hidden">
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-base">Members</CardTitle>
          <CardDescription>Owners always have every permission.</CardDescription>
        </CardHeader>
        <ul className="divide-y">
          {people.map((m) => {
            const count = Object.keys(byId.get(m.userId)?.overrides ?? {}).length;
            return (
              <li key={m.userId}>
                <button
                  type="button"
                  onClick={() => choose(m.userId)}
                  aria-current={m.userId === selectedId}
                  className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50', m.userId === selectedId && 'bg-primary/5')}
                >
                  <Avatar user={m} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {m.name}
                      {m.userId === currentUserId && <span className="font-normal text-muted-foreground"> (you)</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{roleLabel(m.role, m.customRole)}</span>
                  </span>
                  {count > 0 && <Badge variant="primary">{count}</Badge>}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {selected.name}
            <Badge variant="outline">{roleLabel(selected.role, selected.customRole)}</Badge>
            {overrideCount > 0 && <Badge variant="primary">{overrideCount} override{overrideCount === 1 ? '' : 's'}</Badge>}
          </CardTitle>
          <CardDescription>
            Click a cell to cycle <strong>inherit</strong> → <strong>allow</strong> → <strong>deny</strong>, or set a whole module at once. Overrides win over
            the role.
            {self && ' You can’t change your own permissions.'}
          </CardDescription>
        </CardHeader>

        <Matrix
          renderRowControl={(m) => {
            const keys = moduleKeys(m).filter((k) => !lockReason(k));
            const states = new Set(keys.map((k) => stateOf(draft, k)));
            const value = states.size === 1 ? [...states][0]! : 'custom';
            return (
              <Select
                aria-label={`${PERMISSION_MODULES[m].label} override`}
                value={value}
                disabled={!editable || keys.length === 0}
                onChange={(e) => setState(keys, e.target.value as CellState)}
                className="h-8 w-28 text-xs"
              >
                <option value="inherit">Inherit</option>
                <option value="allow">Allow all</option>
                <option value="deny">Deny all</option>
                {value === 'custom' && (
                  <option value="custom" disabled>
                    Custom
                  </option>
                )}
              </Select>
            );
          }}
          renderCell={(key) => {
            const state = stateOf(draft, key);
            const reason = lockReason(key);
            const inherited = roleBase.includes(key);
            const on = effective.has(key);
            return (
              <button
                type="button"
                disabled={!editable || Boolean(reason)}
                onClick={() => setState([key], NEXT_STATE[state])}
                title={reason ?? `${key}: ${state === 'inherit' ? `inherited from role (${inherited ? 'allowed' : 'denied'})` : state}`}
                aria-label={`${key}: ${state}${state === 'inherit' ? (inherited ? ', allowed by role' : ', denied by role') : ''}`}
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  state === 'inherit' && 'border-transparent text-muted-foreground hover:bg-muted',
                  state === 'allow' && 'border-primary/40 bg-primary/15 text-primary',
                  state === 'deny' && 'border-destructive/40 bg-destructive/10 text-destructive',
                )}
              >
                {state === 'deny' ? <X className="h-4 w-4" /> : on ? <Check className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              </button>
            );
          }}
        />

        <div className="flex flex-wrap gap-4 border-t px-4 py-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" /> / <Minus className="h-3.5 w-3.5" /> inherited from role
          </span>
          <span className="flex items-center gap-1.5 text-primary">
            <Check className="h-3.5 w-3.5" /> allowed for this member
          </span>
          <span className="flex items-center gap-1.5 text-destructive">
            <X className="h-3.5 w-3.5" /> denied for this member
          </span>
        </div>

        {editable && (
          <Footer
            dirty={dirty}
            saving={saving}
            onDiscard={() => setDraft(saved)}
            onSave={() => save(draft)}
            extra={
              Object.keys(saved).length > 0 && (
                <Button variant="outline" disabled={saving} onClick={() => save({})}>
                  <RotateCcw className="h-4 w-4" /> Clear overrides
                </Button>
              )
            }
          />
        )}
      </Card>
    </div>
  );
}
