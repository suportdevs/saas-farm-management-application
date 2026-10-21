'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Ban, CircleDollarSign, FilePlus2, Handshake, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CAPABILITIES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PLAN_LIST,
  PLANS,
  type Capability,
  type ManualInvoice,
  type PaymentMethod,
  type PlanId,
  type PlanLimits,
  type PlatformPermission,
  type TenantEntitlements,
} from '@kit/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api, errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { InvoiceStatusBadge } from './invoice-status-badge';

export const CAPABILITY_LABELS: Record<Capability, string> = {
  herd: 'Herd',
  milk: 'Milk',
  health: 'Health',
  breeding: 'Breeding',
  feed: 'Feed',
  finance: 'Finance',
  advanced_reports: 'Advanced reports',
  data_export: 'Data exports',
  api_access: 'API access',
  priority_support: 'Priority support',
  sso: 'Single sign-on',
};

const fieldErrors = (err: unknown) =>
  err instanceof ApiError && err.details ? Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? 'Invalid'])) : null;

/**
 * The manual side of a tenant: a deal on top of the plan (custom limits,
 * modules added or removed) and invoices paid outside Stripe.
 */
export function TenantBilling({
  farmId,
  currency,
  planId,
  planLimits,
  entitlements,
  invoices,
  permissions,
}: {
  farmId: string;
  /** The farm's own currency, the default for new invoices. */
  currency: string;
  planId: PlanId;
  planLimits: PlanLimits;
  entitlements: TenantEntitlements;
  invoices: ManualInvoice[];
  permissions: PlatformPermission[];
}) {
  const canBill = permissions.includes('platform.billing.manage');
  return (
    <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
      <DealCard farmId={farmId} planId={planId} planLimits={planLimits} entitlements={entitlements} canEdit={canBill} />
      <InvoicesCard farmId={farmId} currency={currency} invoices={invoices} canBill={canBill} />
    </div>
  );
}

// ─── Deal ────────────────────────────────────────────────────────

function DealCard({
  farmId,
  planId,
  planLimits,
  entitlements,
  canEdit,
}: {
  farmId: string;
  planId: PlanId;
  planLimits: PlanLimits;
  entitlements: TenantEntitlements;
  canEdit: boolean;
}) {
  const router = useRouter();
  const plan = PLANS[planId];
  const [open, setOpen] = useState(false);
  const limit = (key: keyof PlanLimits) => {
    const v = key in entitlements.limits ? entitlements.limits[key] : planLimits[key];
    return v === null || v === undefined ? 'Unlimited' : v.toLocaleString();
  };
  const added = CAPABILITIES.filter((c) => entitlements.capabilities[c] === true);
  const removed = CAPABILITIES.filter((c) => entitlements.capabilities[c] === false);
  const custom = Object.keys(entitlements.limits).length + added.length + removed.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Handshake className="h-4 w-4 text-primary" /> Deal & limits
            </CardTitle>
            <CardDescription>On top of the {plan.name} plan. Survives plan changes.</CardDescription>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!custom && <Badge variant="outline">Standard plan — no deal</Badge>}
        <dl className="grid grid-cols-2 gap-2">
          {(['members', 'animals'] as const).map((k) => (
            <div key={k} className="rounded-lg border px-3 py-2">
              <dt className="text-xs capitalize text-muted-foreground">{k === 'members' ? 'Team seats' : 'Animals'}</dt>
              <dd className="font-medium">
                {limit(k)}
                {k in entitlements.limits && <span className="ml-1 text-xs text-primary">custom</span>}
              </dd>
            </div>
          ))}
        </dl>
        {added.length > 0 && (
          <p>
            <span className="text-muted-foreground">Added: </span>
            {added.map((c) => CAPABILITY_LABELS[c]).join(', ')}
          </p>
        )}
        {removed.length > 0 && (
          <p>
            <span className="text-muted-foreground">Removed: </span>
            {removed.map((c) => CAPABILITY_LABELS[c]).join(', ')}
          </p>
        )}
        {entitlements.notes && <p className="whitespace-pre-line rounded-lg bg-muted/50 px-3 py-2 text-muted-foreground">{entitlements.notes}</p>}
      </CardContent>
      {open && (
        <DealDialog
          farmId={farmId}
          plan={plan}
          entitlements={entitlements}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}

function DealDialog({
  farmId,
  plan,
  entitlements,
  onClose,
  onSaved,
}: {
  farmId: string;
  plan: (typeof PLANS)[PlanId];
  entitlements: TenantEntitlements;
  onClose: () => void;
  onSaved: () => void;
}) {
  type LimitMode = 'plan' | 'custom' | 'unlimited';
  const modeOf = (k: keyof PlanLimits): LimitMode => (!(k in entitlements.limits) ? 'plan' : entitlements.limits[k] === null ? 'unlimited' : 'custom');
  const [modes, setModes] = useState<Record<keyof PlanLimits, LimitMode>>({ members: modeOf('members'), animals: modeOf('animals') });
  const [values, setValues] = useState<Record<keyof PlanLimits, string>>({
    members: String(entitlements.limits.members ?? ''),
    animals: String(entitlements.limits.animals ?? ''),
  });
  const [caps, setCaps] = useState(entitlements.capabilities);
  const [notes, setNotes] = useState(entitlements.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const limits: Record<string, unknown> = {};
      for (const k of ['members', 'animals'] as const) {
        const cap = k === 'members' ? 'unlimitedMembers' : 'unlimitedAnimals';
        if (modes[k] === 'unlimited') limits[cap] = true;
        if (modes[k] === 'custom') limits[k] = values[k];
      }
      await api.patch(`/admin/farms/${farmId}/entitlements`, { limits, capabilities: caps, notes });
      toast.success('Deal saved');
      onSaved();
    } catch (err) {
      const e = fieldErrors(err);
      if (e) setErrors(e);
      else toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      className="max-w-xl"
      title="Deal & limits"
      description={`Custom terms for this tenant, applied on top of the ${plan.name} plan.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            Save deal
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {(['members', 'animals'] as const).map((k) => (
          <div key={k} className="grid gap-2 sm:grid-cols-[1fr_9rem] sm:items-end">
            <Field id={`limit-${k}`} label={k === 'members' ? 'Team seats' : 'Animals'} error={errors[`limits.${k}`]}>
              <Select
                id={`limit-${k}`}
                className="w-full"
                value={modes[k]}
                onChange={(e) => setModes((m) => ({ ...m, [k]: e.target.value as LimitMode }))}
              >
                <option value="plan">Plan default ({plan.limits[k] === null ? 'unlimited' : plan.limits[k]!.toLocaleString()})</option>
                <option value="custom">Custom limit</option>
                <option value="unlimited">Unlimited</option>
              </Select>
            </Field>
            {modes[k] === 'custom' && (
              <Input
                aria-label={`Custom ${k} limit`}
                inputMode="numeric"
                value={values[k]}
                onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                placeholder="e.g. 40"
              />
            )}
          </div>
        ))}

        <fieldset>
          <legend className="text-sm font-medium">Modules</legend>
          <p className="text-xs text-muted-foreground">Leave on “Plan” to follow the plan; add or remove a module just for this tenant.</p>
          <div className="mt-2 divide-y rounded-lg border">
            {CAPABILITIES.map((c) => {
              const inPlan = plan.capabilities.includes(c);
              const value = caps[c] === undefined ? 'plan' : caps[c] ? 'on' : 'off';
              return (
                <div key={c} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>
                    {CAPABILITY_LABELS[c]}
                    <span className="ml-2 text-xs text-muted-foreground">{inPlan ? 'in plan' : 'not in plan'}</span>
                  </span>
                  <Select
                    aria-label={`${CAPABILITY_LABELS[c]} access`}
                    className="h-8 w-32 text-xs"
                    value={value}
                    onChange={(e) =>
                      setCaps((all) => {
                        const next = { ...all };
                        if (e.target.value === 'plan') delete next[c];
                        else next[c] = e.target.value === 'on';
                        return next;
                      })
                    }
                  >
                    <option value="plan">Plan ({inPlan ? 'on' : 'off'})</option>
                    <option value="on">Add</option>
                    <option value="off">Remove</option>
                  </Select>
                </div>
              );
            })}
          </div>
        </fieldset>

        <Field id="deal-notes" label="Internal notes" hint="Contract number, contact person, renewal terms… Only staff see this.">
          <Textarea id="deal-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

// ─── Invoices ────────────────────────────────────────────────────

function InvoicesCard({ farmId, currency, invoices, canBill }: { farmId: string; currency: string; invoices: ManualInvoice[]; canBill: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<ManualInvoice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const outstanding = invoices.filter((i) => i.status === 'open' || i.status === 'overdue');

  const run = async (key: string, fn: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(message);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CircleDollarSign className="h-4 w-4 text-primary" /> Manual invoices
            </CardTitle>
            <CardDescription>
              Bank transfer, cash and other offline payments. A paid invoice that covers a plan extends the tenant&apos;s subscription.
              {outstanding.length > 0 && ` ${outstanding.length} unpaid.`}
            </CardDescription>
          </div>
          {canBill && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <FilePlus2 className="h-4 w-4" /> New invoice
            </Button>
          )}
        </div>
      </CardHeader>
      {invoices.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-muted-foreground">No manual invoices yet.</p>
      ) : (
        <ul className="divide-y">
          {invoices.map((i) => (
            <li key={i.id} className="space-y-2 px-6 py-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {i.number} <span className="font-normal text-muted-foreground">· {i.description}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Issued {formatDate(i.issuedAt)} · due {formatDate(i.dueAt)}
                    {i.planId && i.periodEnd && ` · pays for ${PLANS[i.planId].name} through ${formatDate(i.periodEnd)}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{formatMoney(i.amount, i.currency)}</p>
                  {i.paid > 0 && i.balance > 0 && <p className="text-xs text-muted-foreground">{formatMoney(i.balance, i.currency)} due</p>}
                </div>
                <InvoiceStatusBadge status={i.status} />
                {canBill && (i.status === 'open' || i.status === 'overdue') && (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => setPaying(i)}>
                      Record payment
                    </Button>
                    {i.paid === 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === `void:${i.id}`}
                        onClick={() => run(`void:${i.id}`, () => api.post(`/admin/farms/${farmId}/invoices/${i.id}/void`), `${i.number} voided`)}
                        title="Void: keep it on record but no longer owed"
                      >
                        <Ban className="h-3.5 w-3.5" /> Void
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {i.payments.length > 0 && (
                <ul className="space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                  {i.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">{formatMoney(p.amount, i.currency)}</span>
                      <span className="text-muted-foreground">
                        {PAYMENT_METHOD_LABELS[p.method]} · {formatDate(p.paidAt)}
                        {p.reference && ` · ref ${p.reference}`}
                        {p.recordedBy && ` · by ${p.recordedBy}`}
                      </span>
                      {canBill && (
                        <button
                          type="button"
                          className="ml-auto text-muted-foreground hover:text-destructive"
                          aria-label="Delete payment"
                          title="Delete this payment (recorded by mistake)"
                          onClick={() => run(`pay:${p.id}`, () => api.delete(`/admin/farms/${farmId}/invoices/${i.id}/payments/${p.id}`), 'Payment removed')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <InvoiceDialog
          farmId={farmId}
          currency={currency}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
      {paying && (
        <PaymentDialog
          farmId={farmId}
          invoice={paying}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null);
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

function InvoiceDialog({ farmId, currency, onClose, onSaved }: { farmId: string; currency: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    description: '',
    amount: '',
    currency,
    issuedAt: inDays(0),
    dueAt: inDays(14),
    planId: '' as PlanId | '',
    periodEnd: inDays(365),
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const { planId, periodEnd, ...rest } = form;
      const { invoice } = await api.post<{ invoice: ManualInvoice }>(`/admin/farms/${farmId}/invoices`, {
        ...rest,
        planId: planId || null,
        periodEnd: planId ? periodEnd : null,
      });
      toast.success(`${invoice.number} created`);
      onSaved();
    } catch (err) {
      const e = fieldErrors(err);
      if (e) setErrors(e);
      else toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      className="max-w-xl"
      title="New invoice"
      description="Numbered automatically (INV-year-00001). Send it to the client yourself, then record payments here."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!form.description || !form.amount} onClick={save}>
            Create invoice
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field id="inv-description" label="Description" error={errors.description}>
            <Input id="inv-description" maxLength={255} placeholder="e.g. Professional plan — 12 months" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
        </div>
        <Field id="inv-amount" label="Amount" error={errors.amount}>
          <Input id="inv-amount" inputMode="decimal" placeholder="1,000.00" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
        </Field>
        <Field id="inv-currency" label="Currency" error={errors.currency}>
          <Input id="inv-currency" maxLength={3} value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} />
        </Field>
        <Field id="inv-issued" label="Issue date" error={errors.issuedAt}>
          <Input id="inv-issued" type="date" value={form.issuedAt} onChange={(e) => set('issuedAt', e.target.value)} />
        </Field>
        <Field id="inv-due" label="Due date" error={errors.dueAt}>
          <Input id="inv-due" type="date" value={form.dueAt} onChange={(e) => set('dueAt', e.target.value)} />
        </Field>
        <Field id="inv-plan" label="Pays for plan (optional)" hint="When paid in full, the tenant moves to this plan.">
          <Select id="inv-plan" className="w-full" value={form.planId} onChange={(e) => set('planId', e.target.value)}>
            <option value="">— Nothing automatic —</option>
            {PLAN_LIST.filter((p) => p.id !== 'free').map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        {form.planId && (
          <Field id="inv-period" label="Paid through" error={errors.periodEnd}>
            <Input id="inv-period" type="date" value={form.periodEnd} onChange={(e) => set('periodEnd', e.target.value)} />
          </Field>
        )}
        <div className="sm:col-span-2">
          <Field id="inv-notes" label="Notes (staff only)">
            <Textarea id="inv-notes" rows={2} maxLength={2000} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function PaymentDialog({ farmId, invoice, onClose, onSaved }: { farmId: string; invoice: ManualInvoice; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState((invoice.balance / 100).toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(inDays(0));
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmFull, setConfirmFull] = useState(true);

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const res = await api.post<{ paidInFull: boolean; planApplied: { planId: PlanId; periodEnd: string } | null }>(
        `/admin/farms/${farmId}/invoices/${invoice.id}/payments`,
        { amount, method, reference, paidAt, notes },
      );
      toast.success(
        res.planApplied
          ? `Paid in full — ${PLANS[res.planApplied.planId].name} active through ${formatDate(res.planApplied.periodEnd)}`
          : res.paidInFull
            ? `${invoice.number} paid in full`
            : 'Payment recorded',
      );
      onSaved();
    } catch (err) {
      const e = fieldErrors(err);
      if (e) setErrors(e);
      else toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Record payment · ${invoice.number}`}
      description={`${formatMoney(invoice.balance, invoice.currency)} of ${formatMoney(invoice.amount, invoice.currency)} due.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!amount || !confirmFull} onClick={save}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pay-amount" label={`Amount (${invoice.currency})`} error={errors.amount}>
          <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field id="pay-date" label="Received on" error={errors.paidAt}>
          <Input id="pay-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </Field>
        <Field id="pay-method" label="Method">
          <Select id="pay-method" className="w-full" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="pay-ref" label="Reference (optional)" hint="Bank reference, receipt no.…">
          <Input id="pay-ref" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field id="pay-notes" label="Notes (optional)">
            <Input id="pay-notes" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        {invoice.planId && invoice.periodEnd && Math.round(Number(amount.replace(/,/g, '')) * 100) >= invoice.balance && (
          <label className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm sm:col-span-2">
            <Checkbox className="mt-0.5" checked={confirmFull} onChange={(e) => setConfirmFull(e.target.checked)} />
            <span>
              This pays the invoice in full: the tenant moves to <strong>{PLANS[invoice.planId].name}</strong> through{' '}
              <strong>{formatDate(invoice.periodEnd)}</strong>.
            </span>
          </label>
        )}
      </div>
    </Dialog>
  );
}
