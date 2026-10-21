'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, Blocks, Building2, Globe2, Landmark, Lock, MapPin, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AREA_UNITS,
  FARM_TYPE_INFO,
  FARM_TYPES,
  MILK_UNITS,
  UNIT_LABELS,
  WEIGHT_UNITS,
  MODULE_CAPABILITIES,
  PERMISSION_MODULES,
  PLAN_LIST,
  TOGGLEABLE_MODULES,
  type ToggleableModule,
  type FarmContext,
  type FarmProfile,
} from '@kit/shared';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useFarm } from '@/modules/farms/context';
import { formatMoney } from '@/lib/format';
import { siteUrl } from '@/lib/utils';
import { CountryOptions, CurrencyOptions, LocaleOptions, TimeZoneOptions } from '@/modules/farms/components/locale-options';

type Editable = Omit<FarmProfile, 'id' | 'goals' | 'disabledModules' | 'suspendedAt' | 'suspendedReason' | 'createdAt' | 'totalArea' | 'herdSize'> & {
  totalArea: string;
  herdSize: string;
};

const toForm = (f: FarmProfile): Editable => {
  const { id: _id, goals: _g, disabledModules: _m, suspendedAt: _s, suspendedReason: _r, createdAt: _c, ...rest } = f;
  return { ...rest, totalArea: f.totalArea?.toString() ?? '', herdSize: f.herdSize?.toString() ?? '' };
};

const MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2024, i, 1)));

export function FarmSettingsForm() {
  const router = useRouter();
  const { farm, membership } = useFarm();
  const original = useMemo(() => toForm(farm), [farm]);
  const [form, setForm] = useState<Editable>(original);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const changed = (Object.keys(form) as (keyof Editable)[]).filter((k) => (form[k] ?? '') !== (original[k] ?? ''));
  const dirty = changed.length > 0;

  const set = <K extends keyof Editable>(key: K, value: Editable[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors(({ [key]: _removed, ...rest }) => rest);
  };

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      const patch = Object.fromEntries(changed.map((k) => [k, form[k] ?? '']));
      const ctx = await api.patch<FarmContext>(`/farms/${farm.slug}`, patch);
      toast.success('Farm settings saved');
      if (ctx.farm.slug !== farm.slug) router.replace(`/farms/${ctx.farm.slug}/settings`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? 'Invalid value'])));
        toast.error('Please fix the highlighted fields');
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const text = (key: keyof Editable, label: string, props: Partial<React.ComponentProps<typeof Input>> = {}, hint?: string) => (
    <Field id={key} label={label} error={errors[key]} hint={hint}>
      <Input id={key} value={(form[key] as string | null) ?? ''} onChange={(e) => set(key, e.target.value as never)} aria-invalid={!!errors[key]} {...props} />
    </Field>
  );

  let moneySample = '';
  try {
    moneySample = formatMoney(1234567, form.currency, form.locale);
  } catch {}

  return (
    <form onSubmit={save} noValidate className="pb-24">
      <PageHeader title="Farm settings" description="Your farm's profile, location and how numbers, money and units are shown to the team." />

      <div className="space-y-6">
        <Section icon={Building2} title="General" description="How your farm appears to your team.">
          <div className="grid gap-5 sm:grid-cols-2">
            {text('name', 'Farm name', { maxLength: 100 })}
            <Field id="type" label="Operation type">
              <Select id="type" className="w-full" value={form.type} onChange={(e) => set('type', e.target.value as Editable['type'])}>
                {FARM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FARM_TYPE_INFO[t].label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field id="slug" label="Workspace address" error={errors.slug} hint="Lowercase letters, numbers and dashes. Changing it breaks old bookmarks.">
                <div className="flex items-center overflow-hidden rounded-lg border border-input bg-muted/50 focus-within:ring-4 focus-within:ring-ring">
                  <span className="hidden pl-3 text-sm text-muted-foreground sm:block">{new URL(siteUrl).host}/farms/</span>
                  <input
                    id="slug"
                    value={form.slug}
                    onChange={(e) => set('slug', e.target.value.toLowerCase())}
                    className="h-10 flex-1 bg-card px-3 text-sm outline-none"
                    maxLength={48}
                  />
                </div>
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field id="description" label="About the farm" error={errors.description}>
                <Textarea
                  id="description"
                  rows={3}
                  maxLength={1000}
                  placeholder="Breeds, history, what makes your farm unique…"
                  value={form.description ?? ''}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>
            </div>
          </div>
        </Section>

        <Section icon={MapPin} title="Location & contact" description="Used on reports, invoices and documents.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="country" label="Country" error={errors.country}>
              <Select id="country" className="w-full" value={form.country} onChange={(e) => set('country', e.target.value)}>
                <CountryOptions current={form.country} />
              </Select>
            </Field>
            {text('region', 'State / province / region', { maxLength: 100 })}
            <div className="sm:col-span-2">{text('address', 'Street address', { maxLength: 255, autoComplete: 'street-address' })}</div>
            {text('city', 'Town / city', { maxLength: 100 })}
            {text('postalCode', 'Postal code', { maxLength: 20, autoComplete: 'postal-code' })}
            {text('phone', 'Phone', { maxLength: 40, type: 'tel', autoComplete: 'tel' })}
            {text('email', 'Farm email', { maxLength: 254, type: 'email' })}
            <div className="sm:col-span-2">{text('website', 'Website', { maxLength: 255, placeholder: 'https://' })}</div>
          </div>
        </Section>

        <Section icon={Globe2} title="Localisation" description="Time zone, currency and the units your team records in.">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field id="timezone" label="Time zone" error={errors.timezone}>
                <Select id="timezone" className="w-full" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                  <TimeZoneOptions current={form.timezone} />
                </Select>
              </Field>
            </div>
            <Field id="currency" label="Currency" error={errors.currency} hint={moneySample && `Example: ${moneySample}`}>
              <Select id="currency" className="w-full" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                <CurrencyOptions current={form.currency} />
              </Select>
            </Field>
            <Field id="locale" label="Number & date format" error={errors.locale}>
              <Select id="locale" className="w-full" value={form.locale} onChange={(e) => set('locale', e.target.value)}>
                <LocaleOptions current={form.locale} />
              </Select>
            </Field>
            <Field id="milkUnit" label="Milk unit">
              <Select id="milkUnit" className="w-full" value={form.milkUnit} onChange={(e) => set('milkUnit', e.target.value as Editable['milkUnit'])}>
                {MILK_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="weightUnit" label="Weight unit">
              <Select
                id="weightUnit"
                className="w-full"
                value={form.weightUnit}
                onChange={(e) => {
                  const weightUnit = e.target.value as Editable['weightUnit'];
                  setForm((f) => ({ ...f, weightUnit, unitSystem: weightUnit === 'lb' ? 'imperial' : 'metric' }));
                }}
              >
                {WEIGHT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="areaUnit" label="Area unit">
              <Select id="areaUnit" className="w-full" value={form.areaUnit} onChange={(e) => set('areaUnit', e.target.value as Editable['areaUnit'])}>
                {AREA_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="fiscalYearStartMonth" label="Financial year starts in">
              <Select
                id="fiscalYearStartMonth"
                className="w-full"
                value={form.fiscalYearStartMonth}
                onChange={(e) => set('fiscalYearStartMonth', Number(e.target.value))}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        <Section icon={Landmark} title="Registration & size" description="Official identifiers for traceability and tax.">
          <div className="grid gap-5 sm:grid-cols-2">
            {text('registrationNumber', 'Farm / holding registration no.', { maxLength: 100 }, 'e.g. CPH, PIC, NAIT or herd number')}
            {text('taxId', 'Tax / VAT ID', { maxLength: 100 })}
            {text('herdSize', 'Approximate herd size', { type: 'number', min: 0, inputMode: 'numeric' })}
            {text('totalArea', `Farm area (${UNIT_LABELS[form.areaUnit].toLowerCase()})`, { type: 'number', min: 0, step: '0.1' })}
          </div>
        </Section>

        <ModulesSection />

        {membership.permissions.includes('farm.delete') && <DangerZone />}
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 lg:left-[16.5rem]">
          <div className="flex w-full max-w-xl animate-fade-up items-center justify-between gap-3 rounded-2xl border bg-card/95 px-5 py-3 shadow-2xl backdrop-blur">
            <p className="text-sm">
              <span className="font-medium">Unsaved changes</span>
              <span className="text-muted-foreground"> · {changed.length} field{changed.length === 1 ? '' : 's'}</span>
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setForm(original);
                  setErrors({});
                }}
              >
                Discard
              </Button>
              <Button type="submit" size="sm" loading={saving}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

function Section({ icon: Icon, title, description, children }: { icon: typeof Globe2; title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 rounded-2xl border bg-card p-6 shadow-sm lg:grid-cols-[14rem_1fr]">
      <div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <h2 className="mt-3 font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

/**
 * Module switches: business modules this farm doesn't use can be turned off
 * for everyone (their permissions and menu items disappear). Saves on toggle.
 */
function ModulesSection() {
  const router = useRouter();
  const { farm, modules } = useFarm();
  const [busy, setBusy] = useState<ToggleableModule | null>(null);

  const toggle = async (module: ToggleableModule, on: boolean) => {
    setBusy(module);
    try {
      const disabledModules = on ? farm.disabledModules.filter((m) => m !== module) : [...farm.disabledModules, module];
      await api.patch<FarmContext>(`/farms/${farm.slug}`, { disabledModules });
      toast.success(`${PERMISSION_MODULES[module].label} ${on ? 'switched on' : 'switched off'}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div id="modules">
      <Section icon={Blocks} title="Modules" description="Switch off what your farm doesn't use. Data is kept and comes back when you switch a module on again.">
        <ul className="divide-y rounded-xl border">
          {TOGGLEABLE_MODULES.map((m) => {
            const on = !farm.disabledModules.includes(m);
            const capability = MODULE_CAPABILITIES[m];
            const inPlan = modules[m] !== 'plan';
            const cheapest = capability ? PLAN_LIST.find((p) => p.capabilities.includes(capability)) : undefined;
            return (
              <li key={m} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{PERMISSION_MODULES[m].label}</p>
                  {!inPlan && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3" /> Needs the {cheapest?.name ?? 'a higher'} plan
                    </p>
                  )}
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    role="switch"
                    className="peer sr-only"
                    checked={on}
                    disabled={busy !== null}
                    onChange={(e) => toggle(m, e.target.checked)}
                    aria-label={`${PERMISSION_MODULES[m].label} module`}
                  />
                  <span className="h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-4 peer-focus-visible:ring-ring peer-disabled:opacity-50" />
                  <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                </label>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

function DangerZone() {
  const router = useRouter();
  const { farm } = useFarm();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const matches = confirm.trim().toLowerCase() === farm.name.toLowerCase();

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/farms/${farm.slug}`, { confirm });
      toast.success(`${farm.name} was deleted`);
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <h2 className="font-semibold">Delete this farm</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently deletes {farm.name}, all of its records and the team&apos;s access. Any subscription is cancelled. This can&apos;t be undone.
            </p>
          </div>
        </div>
        <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" /> Delete farm
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${farm.name}?`}
        description="All animals, records, team members and history for this farm will be permanently removed."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!matches} loading={deleting} onClick={remove}>
              Delete permanently
            </Button>
          </>
        }
      >
        <Field id="confirm-delete" label={`Type "${farm.name}" to confirm`}>
          <Input id="confirm-delete" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </Dialog>
    </section>
  );
}
