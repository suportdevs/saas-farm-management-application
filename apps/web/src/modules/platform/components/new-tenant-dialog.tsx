'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { COUNTRY_CURRENCY, FARM_TYPE_INFO, FARM_TYPES, type FarmType, type Plan, type PlanId, type PlatformOrganization } from '@kit/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ApiError, api, errorMessage } from '@/lib/api';
import { CountryOptions, CurrencyOptions, TimeZoneOptions } from '@/modules/farms/components/locale-options';
import { OrganizationPicker } from './organization-picker';

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Creates a tenant for a client. The owner is added straight away when they
 * already have an account, or invited by email. Optionally starts on a manual plan.
 */
/** `plans`: the plans that can be given out (not archived). */
export function NewTenantButton({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    ownerEmail: '',
    type: 'dairy' as FarmType,
    country: 'US',
    timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
    currency: 'USD',
    planId: '' as PlanId | '',
    periodEnd: inDays(365),
  });
  // A new client gets a new organization; an existing client's farm joins theirs.
  const [orgMode, setOrgMode] = useState<'new' | 'existing'>('new');
  const [orgName, setOrgName] = useState('');
  const [org, setOrg] = useState<PlatformOrganization | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const metric = form.country !== 'US';
      const res = await api.post<{ farm: { id: string; name: string }; invited: boolean }>('/admin/farms', {
        name: form.name,
        ownerEmail: form.ownerEmail,
        type: form.type,
        country: form.country,
        timezone: form.timezone,
        currency: form.currency,
        locale: 'en-US',
        unitSystem: metric ? 'metric' : 'imperial',
        milkUnit: metric ? 'L' : 'lb',
        weightUnit: metric ? 'kg' : 'lb',
        areaUnit: metric ? 'ha' : 'ac',
        goals: [],
        ...(orgMode === 'existing' && org ? { organizationId: org.id } : { organizationName: orgName.trim() || undefined }),
        ...(form.planId ? { planId: form.planId, currentPeriodEnd: new Date(`${form.periodEnd}T23:59:59.999Z`).toISOString() } : {}),
      });
      toast.success(res.invited ? `${res.farm.name} created — owner invitation sent to ${form.ownerEmail}` : `${res.farm.name} created`);
      setOpen(false);
      router.push(`/admin/farms/${res.farm.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? 'Invalid'])));
      else toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New tenant
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        className="max-w-xl"
        title="New tenant"
        description="Set up a farm for a client. Existing users become the owner right away; anyone else gets an owner invitation by email."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} disabled={form.name.trim().length < 2 || !form.ownerEmail || (orgMode === 'existing' && !org)} onClick={save}>
              Create tenant
            </Button>
          </>
        }
      >
        <fieldset className="mb-4 space-y-3">
          <legend className="text-sm font-medium">Client organization</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="org-mode" checked={orgMode === 'new'} onChange={() => setOrgMode('new')} /> New client
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="org-mode" checked={orgMode === 'existing'} onChange={() => setOrgMode('existing')} /> Existing client
            </label>
          </div>
          {orgMode === 'new' ? (
            <Input aria-label="Organization name" maxLength={100} placeholder="Organization name (empty = the farm's name)" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          ) : (
            <OrganizationPicker value={org} onChange={(o) => { setOrg(o); if (o.owner && !form.ownerEmail) set('ownerEmail', o.owner.email); }} />
          )}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="t-name" label="Farm name" error={errors.name}>
            <Input id="t-name" autoFocus maxLength={100} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field id="t-owner" label="Owner email" error={errors.ownerEmail}>
            <Input id="t-owner" type="email" placeholder="owner@client.com" value={form.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} />
          </Field>
          <Field id="t-type" label="Operation type">
            <Select id="t-type" className="w-full" value={form.type} onChange={(e) => set('type', e.target.value as FarmType)}>
              {FARM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FARM_TYPE_INFO[t].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="t-country" label="Country" error={errors.country}>
            <Select
              id="t-country"
              className="w-full"
              value={form.country}
              onChange={(e) => {
                set('country', e.target.value);
                if (COUNTRY_CURRENCY[e.target.value]) set('currency', COUNTRY_CURRENCY[e.target.value]!);
              }}
            >
              <CountryOptions current={form.country} />
            </Select>
          </Field>
          <Field id="t-tz" label="Time zone" error={errors.timezone}>
            <Select id="t-tz" className="w-full" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
              <TimeZoneOptions current={form.timezone} />
            </Select>
          </Field>
          <Field id="t-currency" label="Currency" error={errors.currency}>
            <Select id="t-currency" className="w-full" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
              <CurrencyOptions current={form.currency} />
            </Select>
          </Field>
          <Field id="t-plan" label="Plan" hint="Empty = the normal free trial.">
            <Select id="t-plan" className="w-full" value={form.planId} onChange={(e) => set('planId', e.target.value as PlanId | '')}>
              <option value="">Free trial</option>
              {plans.filter((p) => p.id !== 'free').map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (manual)
                </option>
              ))}
            </Select>
          </Field>
          {form.planId && (
            <Field id="t-period" label="Paid through">
              <Input id="t-period" type="date" value={form.periodEnd} onChange={(e) => set('periodEnd', e.target.value)} />
            </Field>
          )}
        </div>
      </Dialog>
    </>
  );
}
