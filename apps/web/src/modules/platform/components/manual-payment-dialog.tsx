'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BadgeCheck, HandCoins, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, planName, type AdminPlan, type ManualInvoice, type PaymentMethod, type PlanId, type PlatformFarm } from '@kit/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api, errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The tenant a payment is for. `currency` is the farm's own currency when known. */
export interface PaymentTenant {
  id: string;
  name: string;
  detail?: string;
  currency?: string;
}

/**
 * "Record payment" button + dialog: money a tenant paid outside Stripe
 * (cash, bank transfer…). Saves a paid invoice and, when a plan is chosen,
 * moves the tenant to it through the paid-through date.
 * Without `tenant`, the dialog starts with a tenant search.
 */
export function RecordPaymentButton({
  plans,
  tenant,
  variant = 'primary',
  size = 'md',
  className,
}: {
  plans: AdminPlan[];
  tenant?: PaymentTenant;
  variant?: 'primary' | 'outline';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <HandCoins className="h-4 w-4" /> Record payment
      </Button>
      {open && (
        <ManualPaymentDialog
          plans={plans}
          tenant={tenant}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

const PERIODS = [
  { value: '1', label: '1 month' },
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
  { value: 'custom', label: 'Custom date' },
] as const;
type Period = (typeof PERIODS)[number]['value'];

const today = () => new Date().toISOString().slice(0, 10);

/** "2026-01-31" + 1 month → "2026-02-28" (clamped to the month's last day). */
function addMonths(isoDate: string, months: number) {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/** Price of a plan for a number of months, in major units ("480.00"). Plan prices are in USD. */
function suggestedAmount(plan: AdminPlan | undefined, months: number, currency: string) {
  if (!plan || currency !== 'USD') return '';
  const cents = months === 12 && plan.prices.year ? plan.prices.year : plan.prices.month ? plan.prices.month * months : 0;
  return cents ? (cents / 100).toFixed(2) : '';
}

const fieldErrors = (err: unknown) =>
  err instanceof ApiError && err.details ? Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? 'Invalid'])) : null;

function ManualPaymentDialog({ plans, tenant: initialTenant, onClose, onSaved }: { plans: AdminPlan[]; tenant?: PaymentTenant; onClose: () => void; onSaved: () => void }) {
  const payable = plans.filter((p) => p.id !== 'free' && !p.archived && !p.custom);
  const [tenant, setTenant] = useState<PaymentTenant | null>(initialTenant ?? null);
  const [form, setForm] = useState({
    planId: '' as PlanId | '',
    period: '12' as Period,
    paidAt: today(),
    periodEnd: addMonths(today(), 12),
    description: '',
    amount: '',
    currency: initialTenant?.currency ?? 'USD',
    method: 'bank_transfer' as PaymentMethod,
    reference: '',
    notes: '',
  });
  // Once staff type their own description or amount, stop filling them in.
  const [touched, setTouched] = useState({ description: false, amount: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /** Updates fields, then refreshes the paid-through date, description and amount suggestions. */
  const change = (patch: Partial<typeof form>) =>
    setForm((f) => {
      const next = { ...f, ...patch };
      const plan = payable.find((p) => p.id === next.planId);
      const months = next.period === 'custom' ? 0 : Number(next.period);
      if (months) next.periodEnd = addMonths(next.paidAt, months);
      if (!touched.description) {
        const label = months ? PERIODS.find((p) => p.value === next.period)!.label : `through ${formatDate(next.periodEnd)}`;
        next.description = plan ? `${plan.name} plan — ${label}` : '';
      }
      if (!touched.amount && months) next.amount = suggestedAmount(plan, months, next.currency) || (plan ? '' : next.amount);
      return next;
    });

  const save = async () => {
    if (!tenant) return;
    setSaving(true);
    setErrors({});
    try {
      const { planId, periodEnd, period: _period, ...rest } = form;
      const res = await api.post<{ invoice: ManualInvoice; planApplied: { planId: PlanId; periodEnd: string } | null }>(`/admin/farms/${tenant.id}/payments`, {
        ...rest,
        planId: planId || null,
        periodEnd: planId ? periodEnd : null,
      });
      toast.success(
        res.planApplied
          ? `${res.invoice.number} paid — ${tenant.name} is on ${planName(plans, res.planApplied.planId)} through ${formatDate(res.planApplied.periodEnd)}`
          : `${res.invoice.number} saved as paid for ${tenant.name}`,
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

  const plan = payable.find((p) => p.id === form.planId);
  const amountCents = Math.round(Number(form.amount.replace(/[,\s]/g, '')) * 100);

  return (
    <Dialog
      open
      onClose={onClose}
      className="max-w-2xl"
      title="Record manual payment"
      description="Money received outside online checkout (cash, bank transfer…). Saved as a paid invoice the tenant can see on their billing page."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!tenant || !form.description || !form.amount} onClick={save}>
            <HandCoins className="h-4 w-4" /> Save payment
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {tenant ? (
          <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3">
            <BadgeCheck className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{tenant.name}</p>
              {tenant.detail && <p className="truncate text-xs text-muted-foreground">{tenant.detail}</p>}
            </div>
            {!initialTenant && (
              <button type="button" onClick={() => setTenant(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Change tenant">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <TenantSearch onPick={setTenant} />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="mp-plan" label="Pays for plan" hint="The tenant moves to this plan straight away.">
            <Select id="mp-plan" className="w-full" value={form.planId} onChange={(e) => change({ planId: e.target.value as PlanId | '' })}>
              <option value="">— No plan change (other payment) —</option>
              {payable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {form.planId ? (
            <Field id="mp-period" label="Period" error={errors.periodEnd}>
              <div className="flex gap-2">
                <Select id="mp-period" className="flex-1" value={form.period} onChange={(e) => change({ period: e.target.value as Period })}>
                  {PERIODS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
                {form.period === 'custom' && (
                  <Input type="date" aria-label="Paid through" className="flex-1" value={form.periodEnd} onChange={(e) => change({ periodEnd: e.target.value })} />
                )}
              </div>
            </Field>
          ) : (
            <div />
          )}

          <div className="sm:col-span-2">
            <Field id="mp-description" label="Description" error={errors.description}>
              <Input
                id="mp-description"
                maxLength={255}
                placeholder="e.g. Setup fee, Professional plan — 12 months"
                value={form.description}
                onChange={(e) => {
                  setTouched((t) => ({ ...t, description: true }));
                  setForm((f) => ({ ...f, description: e.target.value }));
                }}
              />
            </Field>
          </div>

          <Field id="mp-amount" label="Amount received" error={errors.amount} hint={plan && form.currency !== 'USD' ? 'Plan prices are in USD — enter the amount received.' : undefined}>
            <div className="flex gap-2">
              <Input
                id="mp-amount"
                inputMode="decimal"
                placeholder="1,000.00"
                className="flex-1"
                value={form.amount}
                onChange={(e) => {
                  setTouched((t) => ({ ...t, amount: true }));
                  setForm((f) => ({ ...f, amount: e.target.value }));
                }}
              />
              <Input aria-label="Currency" maxLength={3} className="w-20 uppercase" value={form.currency} onChange={(e) => change({ currency: e.target.value.toUpperCase() })} />
            </div>
          </Field>
          <Field id="mp-date" label="Received on" error={errors.paidAt}>
            <Input id="mp-date" type="date" value={form.paidAt} onChange={(e) => change({ paidAt: e.target.value })} />
          </Field>
          <Field id="mp-method" label="Method">
            <Select id="mp-method" className="w-full" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as PaymentMethod }))}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="mp-ref" label="Reference (optional)" hint="Bank reference, receipt no.…" error={errors.reference}>
            <Input id="mp-ref" maxLength={120} value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
          </Field>
          <div className="sm:col-span-2">
            <Field id="mp-notes" label="Notes (staff only)">
              <Textarea id="mp-notes" rows={2} maxLength={2000} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </Field>
          </div>
        </div>

        {tenant && form.description && amountCents > 0 && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <p>
              <strong>{tenant.name}</strong> paid <strong>{formatMoney(amountCents, form.currency || 'USD')}</strong> by {PAYMENT_METHOD_LABELS[form.method].toLowerCase()} on{' '}
              {formatDate(form.paidAt)}.
            </p>
            {plan && (
              <p className="mt-1 text-muted-foreground">
                They move to <strong className="text-foreground">{plan.name}</strong> through <strong className="text-foreground">{formatDate(form.periodEnd)}</strong>. A longer
                period they already have is kept.
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** Search tenants by farm name, town or owner email (the same search as Admin → Tenants). */
function TenantSearch({ onPick }: { onPick: (tenant: PaymentTenant) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlatformFarm[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setResults([]);
      return;
    }
    // Wait until typing pauses before asking the API.
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { farms } = await api.get<{ farms: PlatformFarm[] }>(`/admin/farms?q=${encodeURIComponent(text)}&pageSize=8`);
        setResults(farms);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <Field id="mp-tenant" label="Tenant" hint="Search by farm name, town or the owner's email.">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input id="mp-tenant" autoFocus className="pl-9" placeholder="Start typing…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {q.trim().length >= 2 && (
        <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border">
          {loading && results.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Searching…</li>}
          {!loading && results.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No tenants match “{q.trim()}”.</li>}
          {results.map((f) => (
            <li key={f.id} className="border-b last:border-0">
              <button
                type="button"
                onClick={() => onPick({ id: f.id, name: f.name, detail: [f.owner?.email, f.subscription.planName].filter(Boolean).join(' · ') })}
                className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted')}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{f.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {f.owner ? `${f.owner.name} · ${f.owner.email}` : 'No owner'} · {f.organization.name}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{f.subscription.planName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}
