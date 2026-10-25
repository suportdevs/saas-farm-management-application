'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Archive, ArchiveRestore, Check, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CAPABILITIES, CAPABILITY_LABELS, type AdminPlan, type Capability } from '@kit/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api, errorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type Editing = { mode: 'create' } | { mode: 'edit'; plan: AdminPlan } | null;

const limitText = (v: number | null) => (v === null ? 'Unlimited' : v.toLocaleString());
const priceText = (plan: AdminPlan) =>
  plan.custom
    ? 'Custom'
    : [plan.prices.month !== undefined && `${formatMoney(plan.prices.month, 'USD')}/mo`, plan.prices.year !== undefined && `${formatMoney(plan.prices.year, 'USD')}/yr`]
        .filter(Boolean)
        .join(' · ') || 'Free';

/**
 * Admin → Plans: every subscription plan with its price, limits and modules,
 * plus a module × plan matrix. Edits apply to the plan's farms at once.
 */
export function PlansManager({ plans, canManage }: { plans: AdminPlan[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<AdminPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Plans decide each farm&apos;s limits and modules. Changes apply to every farm on the plan straight away. Archive a plan to stop offering it — its
          farms keep it. Per-tenant deals (Tenants → a farm) override a plan for one farm.
        </p>
        {canManage && (
          <Button onClick={() => setEditing({ mode: 'create' })}>
            <Plus className="h-4 w-4" /> New plan
          </Button>
        )}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Plan</th>
              <th className="px-5 py-3 font-medium">Price</th>
              <th className="px-5 py-3 font-medium">Limits</th>
              <th className="px-5 py-3 font-medium">Sold</th>
              <th className="px-5 py-3 text-right font-medium">Farms</th>
              <th className="w-32 px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {plans.map((p) => (
              <tr key={p.id} className={p.archived ? 'align-top opacity-60' : 'align-top hover:bg-muted/30'}>
                <td className="px-5 py-3">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium">
                    {p.name}
                    {p.highlighted && <Badge variant="primary">Highlighted</Badge>}
                    {p.archived && <Badge variant="outline">Archived</Badge>}
                    {p.locked && <Badge variant="outline">{p.locked === 'free' ? 'Fallback plan' : 'Trial plan'}</Badge>}
                  </p>
                  <code className="text-xs text-muted-foreground">{p.id}</code>
                  {p.tagline && <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">{p.tagline}</p>}
                </td>
                <td className="px-5 py-3 tabular-nums">{priceText(p)}</td>
                <td className="px-5 py-3 text-xs">
                  {limitText(p.limits.animals)} animals
                  <br />
                  {limitText(p.limits.members)} members
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {p.isPublic ? <Badge variant="success">Public</Badge> : <Badge variant="outline">Hidden</Badge>}
                    {p.selfServe && <Badge variant="info">Online checkout</Badge>}
                  </div>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">{p.subscriberCount}</td>
                <td className="px-5 py-3">
                  {canManage && (
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => setEditing({ mode: 'edit', plan: p })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {p.archived ? (
                        <Button size="icon" variant="ghost" aria-label={`Restore ${p.name}`} disabled={busy} onClick={() => run(() => api.post(`/admin/plans/${p.id}/restore`), `${p.name} restored`)}>
                          <ArchiveRestore className="h-4 w-4" />
                        </Button>
                      ) : p.locked ? (
                        <Lock className="m-2.5 h-4 w-4 text-muted-foreground" aria-label="Can't be archived" />
                      ) : (
                        <Button size="icon" variant="ghost" aria-label={`Archive ${p.name}`} disabled={busy} onClick={() => run(() => api.post(`/admin/plans/${p.id}/archive`), `${p.name} archived`)}>
                          <Archive className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${p.name}`}
                        disabled={Boolean(p.locked) || p.subscriberCount > 0}
                        title={p.subscriberCount > 0 ? 'Farms use this plan — archive it instead' : undefined}
                        onClick={() => setDeleting(p)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ModuleMatrix plans={plans.filter((p) => !p.archived)} />

      {editing && (
        <PlanDialog
          key={editing.mode === 'edit' ? editing.plan.id : 'new'}
          editing={editing}
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
        description="The plan is removed for good. No farm or invoice uses it."
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={busy} onClick={() => deleting && run(() => api.delete(`/admin/plans/${deleting.id}`), `${deleting.name} deleted`)}>
              Delete plan
            </Button>
          </>
        }
      />
    </div>
  );
}

/** Which plan includes which module — the "Module" view of the catalog. */
function ModuleMatrix({ plans }: { plans: AdminPlan[] }) {
  return (
    <Card className="overflow-x-auto">
      <div className="border-b px-5 py-3">
        <h2 className="font-semibold">Modules by plan</h2>
        <p className="text-xs text-muted-foreground">Edit a plan to change its modules. A tenant&apos;s deal can add or remove a module for one farm.</p>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-5 py-3 font-medium">Module</th>
            {plans.map((p) => (
              <th key={p.id} className="px-5 py-3 text-center font-medium">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {CAPABILITIES.map((c) => (
            <tr key={c}>
              <td className="px-5 py-2">{CAPABILITY_LABELS[c]}</td>
              {plans.map((p) => (
                <td key={p.id} className="px-5 py-2 text-center">
                  {p.capabilities.includes(c) ? <Check className="mx-auto h-4 w-4 text-success" aria-label="Included" /> : <span className="text-muted-foreground">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const asText = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

function PlanDialog({ editing, onClose, onSaved }: { editing: Exclude<Editing, null>; onClose: () => void; onSaved: () => void }) {
  const plan = editing.mode === 'edit' ? editing.plan : null;
  const [form, setForm] = useState({
    id: plan?.id ?? '',
    name: plan?.name ?? '',
    tagline: plan?.tagline ?? '',
    priceMonth: asText(plan?.prices.month),
    priceYear: asText(plan?.prices.year),
    animals: asText(plan ? plan.limits.animals : 100),
    members: asText(plan ? plan.limits.members : 5),
    custom: plan?.custom ?? false,
    highlighted: plan?.highlighted ?? false,
    isPublic: plan?.isPublic ?? true,
    selfServe: plan?.selfServe ?? false,
    stripeMonth: plan?.stripePrices.month ?? '',
    stripeYear: plan?.stripePrices.year ?? '',
    features: (plan?.features ?? []).join('\n'),
    sortOrder: String(plan?.sortOrder ?? 10),
  });
  const [capabilities, setCapabilities] = useState<Capability[]>(plan?.capabilities ?? ['herd', 'milk', 'health', 'breeding', 'products']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));
  const isFree = plan?.locked === 'free';

  const save = async () => {
    setSaving(true);
    setErrors({});
    const body = {
      ...(plan ? {} : { id: form.id }),
      name: form.name,
      tagline: form.tagline,
      prices: { month: form.priceMonth, year: form.priceYear },
      limits: { animals: form.animals, members: form.members },
      custom: form.custom,
      highlighted: form.highlighted,
      isPublic: form.isPublic,
      selfServe: form.selfServe,
      capabilities,
      features: form.features
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      stripePrices: { month: form.stripeMonth, year: form.stripeYear },
      sortOrder: form.sortOrder,
    };
    try {
      if (plan) await api.patch(`/admin/plans/${plan.id}`, body);
      else await api.post('/admin/plans', body);
      toast.success(plan ? 'Plan saved' : 'Plan created');
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? 'Invalid'])));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      className="max-w-2xl"
      title={plan ? `Edit ${plan.name}` : 'New plan'}
      description={plan ? `Farms on this plan (${plan.subscriberCount}) get the changes straight away.` : 'Prices are in US cents, e.g. 2900 = $29.00.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            {plan ? 'Save plan' : 'Create plan'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="plan-id" label="Code" hint="Lowercase, can't change later." error={errors.id}>
          <Input id="plan-id" value={form.id} disabled={Boolean(plan)} placeholder="e.g. coop" onChange={(e) => set('id', e.target.value)} />
        </Field>
        <Field id="plan-name" label="Name" error={errors.name}>
          <Input id="plan-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field id="plan-tagline" label="Tagline" error={errors.tagline}>
            <Input id="plan-tagline" value={form.tagline} maxLength={160} onChange={(e) => set('tagline', e.target.value)} />
          </Field>
        </div>
        <Field id="plan-month" label="Monthly price (cents)" hint="Empty = not sold monthly." error={errors['prices.month']}>
          <Input id="plan-month" inputMode="numeric" value={form.priceMonth} disabled={isFree || form.custom} onChange={(e) => set('priceMonth', e.target.value)} />
        </Field>
        <Field id="plan-year" label="Yearly price (cents)" hint="Empty = not sold yearly." error={errors['prices.year']}>
          <Input id="plan-year" inputMode="numeric" value={form.priceYear} disabled={isFree || form.custom} onChange={(e) => set('priceYear', e.target.value)} />
        </Field>
        <Field id="plan-animals" label="Animals" hint="Empty = unlimited." error={errors['limits.animals']}>
          <Input id="plan-animals" inputMode="numeric" value={form.animals} onChange={(e) => set('animals', e.target.value)} />
        </Field>
        <Field id="plan-members" label="Team members" hint="Empty = unlimited." error={errors['limits.members']}>
          <Input id="plan-members" inputMode="numeric" value={form.members} onChange={(e) => set('members', e.target.value)} />
        </Field>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {(
          [
            ['isPublic', 'Public — on the pricing and billing pages'],
            ['selfServe', 'Online checkout (Stripe)'],
            ['custom', 'Custom price — “Talk to sales”'],
            ['highlighted', 'Highlight as recommended'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <Checkbox checked={form[key]} disabled={isFree && (key === 'selfServe' || key === 'custom')} onChange={(e) => set(key, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      {form.selfServe && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="plan-stripe-month" label="Stripe price id — monthly" hint="Empty = use the server's env setting.">
            <Input id="plan-stripe-month" value={form.stripeMonth} placeholder="price_…" onChange={(e) => set('stripeMonth', e.target.value)} />
          </Field>
          <Field id="plan-stripe-year" label="Stripe price id — yearly">
            <Input id="plan-stripe-year" value={form.stripeYear} placeholder="price_…" onChange={(e) => set('stripeYear', e.target.value)} />
          </Field>
        </div>
      )}

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Modules</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={capabilities.includes(c)}
                onChange={(e) => setCapabilities((cur) => (e.target.checked ? [...cur, c] : cur.filter((x) => x !== c)))}
              />
              {CAPABILITY_LABELS[c]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field id="plan-features" label="Features (one per line)" hint="Bullet points on the plan card." error={errors.features}>
          <Textarea id="plan-features" rows={4} value={form.features} onChange={(e) => set('features', e.target.value)} />
        </Field>
        <Field id="plan-order" label="Order" hint="Lower first." error={errors.sortOrder}>
          <Input id="plan-order" inputMode="numeric" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
