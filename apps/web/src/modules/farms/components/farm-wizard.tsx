'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Globe2, MapPin, Ruler, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  AREA_UNITS,
  countryDefaults,
  FARM_TYPE_INFO,
  FARM_TYPES,
  MILK_UNITS,
  UNIT_LABELS,
  WEIGHT_UNITS,
  type AreaUnit,
  type FarmContext,
  type FarmType,
  type MilkUnit,
  type OrganizationRef,
  type UnitSystem,
  type WeightUnit,
} from '@kit/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ApiError, api, errorMessage } from '@/lib/api';
import { countryName, flag, formatMoney, tzOffset } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FARM_TYPE_ICONS, GOALS } from '@/modules/farms/constants';
import { CountryOptions, CurrencyOptions, guessCountry, guessLocale, LocaleOptions, TimeZoneOptions } from '@/modules/farms/components/locale-options';

interface FormState {
  name: string;
  type: FarmType;
  country: string;
  region: string;
  city: string;
  timezone: string;
  currency: string;
  locale: string;
  unitSystem: UnitSystem;
  milkUnit: MilkUnit;
  weightUnit: WeightUnit;
  areaUnit: AreaUnit;
  herdSize: string;
  totalArea: string;
  goals: string[];
}

const STEPS = [
  { title: 'Your farm', description: 'Name and type of operation', icon: Sparkles },
  { title: 'Location', description: 'Country, time zone and currency', icon: Globe2 },
  { title: 'Operation', description: 'Size, units and goals', icon: Ruler },
];

const STEP_FIELDS: (keyof FormState)[][] = [
  ['name', 'type'],
  ['country', 'region', 'city', 'timezone', 'currency', 'locale'],
  ['herdSize', 'totalArea', 'areaUnit', 'milkUnit', 'weightUnit', 'unitSystem', 'goals'],
];

const initial: FormState = {
  name: '',
  type: 'dairy',
  country: 'US',
  region: '',
  city: '',
  timezone: 'UTC',
  locale: 'en-US',
  ...countryDefaults('US'),
  herdSize: '',
  totalArea: '',
  goals: [],
};

export function FarmWizard({
  firstName,
  isFirstFarm,
  trialDays,
  trialPlanName,
  organizations,
  organizationId: initialOrg,
}: {
  firstName: string;
  isFirstFarm: boolean;
  trialDays: number;
  trialPlanName: string;
  /** Organizations the user may add farms to (owner or admin). */
  organizations: OrganizationRef[];
  organizationId?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [organizationId, setOrganizationId] = useState(initialOrg ?? organizations[0]?.id ?? '');
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Localise defaults from the browser once mounted (avoids hydration mismatches).
  useEffect(() => {
    const country = guessCountry() ?? 'US';
    let timezone = 'UTC';
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {}
    setForm((f) => ({ ...f, country, timezone, locale: guessLocale(country), ...countryDefaults(country) }));
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const { [key]: _removed, ...rest } = e;
      return rest;
    });
  };

  const changeCountry = (country: string) => {
    setForm((f) => ({ ...f, country, ...countryDefaults(country) }));
  };

  const validateStep = (i: number) => {
    if (i === 0 && form.name.trim().length < 2) {
      setErrors({ name: 'Give your farm a name (at least 2 characters)' });
      return false;
    }
    return true;
  };

  const next = (e?: FormEvent) => {
    e?.preventDefault();
    if (!validateStep(step)) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else void submit();
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const ctx = await api.post<FarmContext>('/farms', {
        ...form,
        unitSystem: form.weightUnit === 'lb' ? 'imperial' : 'metric',
        // Empty: the farm goes to the user's own organization (created for a first farm).
        ...(organizationId ? { organizationId } : {}),
      });
      toast.success(`${ctx.farm.name} is ready`);
      router.push(`/farms/${ctx.farm.slug}?welcome=1`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        const fieldErrors = Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? 'Invalid value']));
        setErrors(fieldErrors);
        const firstStep = STEP_FIELDS.findIndex((fields) => fields.some((f) => f in fieldErrors));
        if (firstStep >= 0) setStep(firstStep);
      } else {
        toast.error(errorMessage(err));
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-14">
      <div className="animate-fade-up">
        <Badge variant="primary" className="mb-4">
          <Sparkles className="h-3 w-3" />
          {isFirstFarm ? `Welcome, ${firstName}` : 'New farm'}
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{isFirstFarm ? "Let's set up your farm" : 'Add another farm'}</h1>
        <p className="mt-2 text-muted-foreground">
          It takes about a minute. Everything can be changed later in farm settings.
          {trialDays > 0 && ` Every new farm gets ${trialDays} days of ${trialPlanName} free — no card needed.`}
        </p>

        <ol className="mt-8 grid grid-cols-3 gap-2" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <button
                type="button"
                disabled={i > step}
                onClick={() => setStep(i)}
                className="group w-full text-left disabled:cursor-default"
                aria-current={i === step ? 'step' : undefined}
              >
                <div className={cn('h-1.5 rounded-full transition-colors', i <= step ? 'bg-primary' : 'bg-muted')} />
                <p className={cn('mt-2 text-xs font-semibold uppercase tracking-wide', i === step ? 'text-primary' : 'text-muted-foreground')}>
                  Step {i + 1}
                </p>
                <p className="hidden text-sm font-medium sm:block">{s.title}</p>
              </button>
            </li>
          ))}
        </ol>

        <form onSubmit={next} className="mt-8 rounded-2xl border bg-card p-6 shadow-sm sm:p-8" noValidate>
          {step === 0 && (
            <div key="s0" className="animate-fade-up space-y-6">
              <Field id="name" label="Farm name" error={errors.name}>
                <Input
                  id="name"
                  autoFocus
                  placeholder="e.g. Green Valley Dairy"
                  value={form.name}
                  maxLength={100}
                  onChange={(e) => set('name', e.target.value)}
                  aria-invalid={!!errors.name}
                  className="h-12 text-base"
                />
              </Field>
              {organizations.length > 1 && (
                <Field id="organization" label="Organization" hint="The client or business this farm belongs to." error={errors.organizationId}>
                  <Select id="organization" className="w-full" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <fieldset>
                <legend className="text-sm font-medium">What kind of operation is it?</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {FARM_TYPES.map((type) => {
                    const Icon = FARM_TYPE_ICONS[type];
                    const active = form.type === type;
                    return (
                      <label
                        key={type}
                        className={cn(
                          'relative flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-all hover:border-primary/50',
                          active && 'border-primary bg-primary/5 ring-4 ring-primary/10',
                        )}
                      >
                        <input type="radio" name="type" value={type} checked={active} onChange={() => set('type', type)} className="sr-only" />
                        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="font-medium">{FARM_TYPE_INFO[type].label}</span>
                        <span className="text-xs text-muted-foreground">{FARM_TYPE_INFO[type].description}</span>
                        {active && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          )}

          {step === 1 && (
            <div key="s1" className="animate-fade-up grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field id="country" label="Country" error={errors.country} hint="We'll suggest currency and units for you.">
                  <Select id="country" className="w-full" value={form.country} onChange={(e) => changeCountry(e.target.value)}>
                    <CountryOptions current={form.country} />
                  </Select>
                </Field>
              </div>
              <Field id="region" label="State / province / region" error={errors.region}>
                <Input id="region" value={form.region} maxLength={100} onChange={(e) => set('region', e.target.value)} placeholder="Optional" />
              </Field>
              <Field id="city" label="Nearest town" error={errors.city}>
                <Input id="city" value={form.city} maxLength={100} onChange={(e) => set('city', e.target.value)} placeholder="Optional" />
              </Field>
              <div className="sm:col-span-2">
                <Field id="timezone" label="Time zone" error={errors.timezone} hint="Records and reminders follow the farm's local time.">
                  <Select id="timezone" className="w-full" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                    <TimeZoneOptions current={form.timezone} />
                  </Select>
                </Field>
              </div>
              <Field id="currency" label="Currency" error={errors.currency}>
                <Select id="currency" className="w-full" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                  <CurrencyOptions current={form.currency} />
                </Select>
              </Field>
              <Field id="locale" label="Number & date format" error={errors.locale}>
                <Select id="locale" className="w-full" value={form.locale} onChange={(e) => set('locale', e.target.value)}>
                  <LocaleOptions current={form.locale} />
                </Select>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div key="s2" className="animate-fade-up space-y-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="herdSize" label="Approximate herd size" error={errors.herdSize}>
                  <Input id="herdSize" type="number" min={0} inputMode="numeric" placeholder="e.g. 120" value={form.herdSize} onChange={(e) => set('herdSize', e.target.value)} />
                </Field>
                <Field id="totalArea" label="Farm area" error={errors.totalArea}>
                  <div className="flex gap-2">
                    <Input id="totalArea" type="number" min={0} step="0.1" placeholder="e.g. 80" value={form.totalArea} onChange={(e) => set('totalArea', e.target.value)} />
                    <Select aria-label="Area unit" value={form.areaUnit} onChange={(e) => set('areaUnit', e.target.value as AreaUnit)}>
                      {AREA_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {UNIT_LABELS[u]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </Field>
                {(form.type === 'dairy' || form.type === 'mixed') && (
                  <Field id="milkUnit" label="Record milk in">
                    <Select id="milkUnit" className="w-full" value={form.milkUnit} onChange={(e) => set('milkUnit', e.target.value as MilkUnit)}>
                      {MILK_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {UNIT_LABELS[u]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field id="weightUnit" label="Weigh animals in">
                  <Select id="weightUnit" className="w-full" value={form.weightUnit} onChange={(e) => set('weightUnit', e.target.value as WeightUnit)}>
                    {WEIGHT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {UNIT_LABELS[u]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <fieldset>
                <legend className="text-sm font-medium">What matters most right now?</legend>
                <p className="text-xs text-muted-foreground">Pick any — we&apos;ll tailor your dashboard.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {GOALS.map((g) => {
                    const on = form.goals.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set('goals', on ? form.goals.filter((x) => x !== g.id) : [...form.goals, g.id])}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                          on ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/50 hover:bg-muted',
                        )}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                        {g.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t pt-6">
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={() => setStep(step - 1)} disabled={submitting}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" size="lg" loading={submitting}>
              {step < STEPS.length - 1 ? (
                <>
                  Continue <ArrowRight className="h-4 w-4" />
                </>
              ) : submitting ? (
                'Creating your farm…'
              ) : (
                <>
                  Create farm <Sparkles className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      <FarmPreview form={form} />
    </div>
  );
}

/** Live preview: shows how the farm's locale settings will look in practice. */
function FarmPreview({ form }: { form: FormState }) {
  const Icon = FARM_TYPE_ICONS[form.type];
  let money = '';
  let today = '';
  try {
    money = formatMoney(1234567, form.currency, form.locale);
    today = new Intl.DateTimeFormat(form.locale, { dateStyle: 'full', timeZone: form.timezone }).format(new Date());
  } catch {}
  const herd = Number(form.herdSize) || 0;
  return (
    <aside className="hidden lg:block" aria-label="Preview">
      <div className="sticky top-8 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live preview</p>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xl shadow-primary/5">
          <div className="relative bg-gradient-to-br from-emerald-700 via-green-700 to-teal-800 p-5 text-white">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-300/30 blur-2xl" />
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
              <Icon className="h-5 w-5" />
            </span>
            <p className="mt-4 truncate text-lg font-semibold">{form.name.trim() || 'Your farm'}</p>
            <p className="flex items-center gap-1.5 text-sm text-white/80">
              <MapPin className="h-3.5 w-3.5" />
              {[form.city, form.region].filter(Boolean).join(', ') || countryName(form.country)} {flag(form.country)}
            </p>
          </div>
          <dl className="divide-y text-sm">
            <PreviewRow label="Type" value={FARM_TYPE_INFO[form.type].label} />
            <PreviewRow label="Local time" value={`${tzOffset(form.timezone)}`} />
            <PreviewRow label="Money" value={money} />
            <PreviewRow label="Milk / weight" value={`${form.milkUnit} · ${form.weightUnit}`} />
            {herd > 0 && <PreviewRow label="Herd" value={`~${herd.toLocaleString(form.locale)} head`} />}
          </dl>
          <p className="border-t bg-muted/40 px-5 py-3 text-xs text-muted-foreground">{today}</p>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {['Your data is private to your farm team', 'Switch between farms any time', 'Invite your team after setup'].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" /> {t}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium tabular-nums">{value}</dd>
    </div>
  );
}
