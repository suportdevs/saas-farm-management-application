'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ANIMAL_SEXES, ANIMAL_TYPES, PURCHASE_SOURCE_TYPES, sharedCostOf, splitSharedCost, type PurchaseDetail } from '@kit/shared';
import { PageHeader } from '@/components/app/page-header';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useCan, useFarm } from '@/modules/farms/context';
import { CatalogSelect } from '@/modules/products/components/catalog-select';
import { useT } from '@/i18n/provider';
import { money } from '../money';

/** One animal line as typed (numbers stay text until saved). */
type Line = { id: number; key: string; tag: string; name: string; sex: string; type: string; breed: string; price: string; entryWeightKg: string };

const num = (v: string) => (v.trim() === '' ? 0 : Number(v) || 0);
const text = (v: number | null | undefined) => (v == null ? '' : String(v));
let nextId = 1;
const emptyLine = (): Line => ({ id: nextId++, key: '', tag: '', name: '', sex: 'female', type: '', breed: '', price: '', entryWeightKg: '' });

/**
 * Create / edit a purchase: header, shared costs and one line per animal.
 * Shared costs are split over the lines by price share as you type (the API
 * stores the same split). Saving adds or updates the animals in the herd.
 */
export function PurchaseForm({ purchase }: { purchase?: PurchaseDetail }) {
  const t = useT();
  const router = useRouter();
  const { farm } = useFarm();
  const canSave = useCan(purchase ? 'purchase.purchase_edit' : 'purchase.purchase_create');
  const canDelete = useCan('purchase.purchase_delete');
  const listHref = `/farms/${farm.slug}/purchases`;

  const [header, setHeader] = useState({
    number: purchase?.number ?? '',
    purchaseDate: purchase?.purchaseDate ?? new Date().toISOString().slice(0, 10),
    sourceType: purchase?.sourceType ?? 'haat',
    haatName: purchase?.haatName ?? '',
    supplierKey: purchase?.supplierKey ?? '',
    brokerKey: purchase?.brokerKey ?? '',
    batchKey: purchase?.batchKey ?? '',
    transportCost: text(purchase?.transportCost),
    brokerFee: text(purchase?.brokerFee),
    tollCost: text(purchase?.tollCost),
    otherCost: text(purchase?.otherCost),
    notes: purchase?.notes ?? '',
  });
  const [lines, setLines] = useState<Line[]>(() =>
    purchase?.items.length
      ? purchase.items.map((i) => ({ id: nextId++, key: i.key, tag: i.tag ?? '', name: i.name ?? '', sex: i.sex ?? 'female', type: i.type ?? '', breed: i.breed ?? '', price: text(i.price), entryWeightKg: text(i.entryWeightKg) }))
      : [emptyLine()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (field: keyof typeof header, value: string) => setHeader((h) => ({ ...h, [field]: value }));
  const setLine = (id: number, field: keyof Line, value: string) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, [field]: value } : l)));

  // Live totals, split the same way as the API.
  const shared = sharedCostOf({ transportCost: num(header.transportCost), brokerFee: num(header.brokerFee), tollCost: num(header.tollCost), otherCost: num(header.otherCost) });
  const prices = lines.map((l) => num(l.price));
  const shares = splitSharedCost(prices, shared);
  const totalPrice = prices.reduce((a, b) => a + b, 0);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const body = {
      ...header,
      items: lines.map(({ id: _id, ...l }) => l),
    };
    try {
      const saved = purchase
        ? await api.put<PurchaseDetail>(`/farms/${farm.slug}/purchases/${purchase.key}`, body)
        : await api.post<PurchaseDetail>(`/farms/${farm.slug}/purchases`, body);
      toast.success(purchase ? t('Purchase updated') : t(saved.animals === 1 ? 'Purchase saved — {count} animal added to the herd' : 'Purchase saved — {count} animals added to the herd', { count: saved.animals }));
      router.push(listHref);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? 'Invalid'])));
      toast.error(errorMessage(err));
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await api.delete(`/farms/${farm.slug}/purchases/${purchase!.key}`);
      toast.success(t('Purchase deleted'));
      router.push(listHref);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  const lineError = (i: number, field: string) => errors[`items.${i}.${field}`];

  return (
    <form onSubmit={save} className="space-y-5 pb-20">
      <PageHeader
        compact
        eyebrow={t('Purchases')}
        title={purchase ? t('Purchase {number}', { number: purchase.number }) : t('New purchase')}
        description={t('One trip or invoice. Each animal line is added to the herd; shared costs are split by price.')}
        actions={
          purchase && canDelete ? (
            <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> {t('Delete')}
            </Button>
          ) : undefined
        }
      />

      <fieldset disabled={!canSave || saving} className="space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('Purchase details')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="p-number" label="Purchase no." error={errors.number}>
              <Input id="p-number" value={header.number} onChange={(e) => set('number', e.target.value)} placeholder="PO-2026-001" required />
            </Field>
            <Field id="p-date" label="Purchase date" error={errors.purchaseDate}>
              <Input id="p-date" type="date" value={header.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value)} required />
            </Field>
            <Field id="p-source" label="Source" error={errors.sourceType}>
              <Select id="p-source" className="w-full" value={header.sourceType} onChange={(e) => set('sourceType', e.target.value)}>
                {PURCHASE_SOURCE_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {t(s.label)}
                  </option>
                ))}
              </Select>
            </Field>
            {header.sourceType === 'haat' && (
              <Field id="p-haat" label="Haat name" error={errors.haatName}>
                <Input id="p-haat" value={header.haatName} onChange={(e) => set('haatName', e.target.value)} placeholder="Gabtoli haat" />
              </Field>
            )}
            <Field id="p-supplier" label="Supplier" error={errors.supplierKey}>
              <CatalogSelect id="p-supplier" resource="suppliers" value={header.supplierKey} initialLabel={purchase?.supplierName ?? undefined} onChange={(v) => set('supplierKey', v)} placeholder="Choose a supplier" clearable />
            </Field>
            <Field id="p-broker" label="Broker" error={errors.brokerKey} hint="Brokers are suppliers too (e.g. type “Broker”).">
              <CatalogSelect id="p-broker" resource="suppliers" value={header.brokerKey} initialLabel={purchase?.brokerName ?? undefined} onChange={(v) => set('brokerKey', v)} placeholder="Choose a broker" clearable />
            </Field>
            <Field id="p-batch" label="Batch" error={errors.batchKey} hint="The animals join this batch.">
              <CatalogSelect id="p-batch" resource="batches" value={header.batchKey} initialLabel={purchase?.batchName ?? undefined} onChange={(v) => set('batchKey', v)} placeholder="Choose a batch" clearable />
            </Field>
            <Field id="p-notes" label="Notes" error={errors.notes} className="sm:col-span-2 lg:col-span-4">
              <Textarea id="p-notes" rows={2} value={header.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('Shared costs')}</CardTitle>
            <CardDescription>{t('Split over the animals by price share. Total: {total}', { total: money(farm, shared) })}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['transportCost', 'Transport'],
                ['brokerFee', 'Broker fee'],
                ['tollCost', 'Toll'],
                ['otherCost', 'Other'],
              ] as const
            ).map(([field, label]) => (
              <Field key={field} id={`p-${field}`} label={label} error={errors[field]}>
                <Input id={`p-${field}`} type="number" min={0} step="0.01" inputMode="decimal" value={header[field]} onChange={(e) => set(field, e.target.value)} placeholder="0" />
              </Field>
            ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b pb-3">
            <div className="space-y-1">
              <CardTitle className="text-base">{t('Animals')} ({lines.length})</CardTitle>
              {errors.items && <p className="text-sm text-destructive">{t(errors.items)}</p>}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              <Plus className="h-4 w-4" /> {t('Add animal')}
            </Button>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('Ear tag')} *</th>
                  <th className="px-3 py-2 font-medium">{t('Name')}</th>
                  <th className="px-3 py-2 font-medium">{t('Sex')} *</th>
                  <th className="px-3 py-2 font-medium">{t('Type')}</th>
                  <th className="px-3 py-2 font-medium">{t('Breed')}</th>
                  <th className="px-3 py-2 font-medium">{t('Price')} *</th>
                  <th className="px-3 py-2 font-medium">{t('Entry weight (kg)')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Shared cost')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Landed cost')}</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l, i) => {
                  const cell = (field: keyof Line, props: Partial<React.ComponentProps<typeof Input>> = {}) => (
                    <td className="px-2 py-1.5 align-top">
                      <Input
                        aria-label={`${field} of line ${i + 1}`}
                        className="h-9"
                        value={l[field] as string}
                        onChange={(e) => setLine(l.id, field, e.target.value)}
                        aria-invalid={!!lineError(i, field) || undefined}
                        {...props}
                      />
                      {lineError(i, field) && <p className="mt-1 text-xs text-destructive">{t(lineError(i, field)!)}</p>}
                    </td>
                  );
                  return (
                    <tr key={l.id}>
                      {cell('tag', { placeholder: 'BD-1024' })}
                      {cell('name')}
                      <td className="px-2 py-1.5 align-top">
                        <Select aria-label={`Sex of line ${i + 1}`} className="h-9 w-full min-w-[6.5rem]" value={l.sex} onChange={(e) => setLine(l.id, 'sex', e.target.value)}>
                          {ANIMAL_SEXES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {t(s.label)}
                            </option>
                          ))}
                        </Select>
                        {lineError(i, 'sex') && <p className="mt-1 text-xs text-destructive">{t(lineError(i, 'sex')!)}</p>}
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <Select aria-label={`Type of line ${i + 1}`} className="h-9 w-full min-w-[6.5rem]" value={l.type} onChange={(e) => setLine(l.id, 'type', e.target.value)}>
                          <option value="">—</option>
                          {ANIMAL_TYPES.map((tp) => (
                            <option key={tp.value} value={tp.value}>
                              {t(tp.label)}
                            </option>
                          ))}
                        </Select>
                      </td>
                      {cell('breed', { placeholder: 'Sahiwal' })}
                      {cell('price', { type: 'number', min: 0, step: '0.01', inputMode: 'decimal' })}
                      {cell('entryWeightKg', { type: 'number', min: 0, step: '0.01', inputMode: 'decimal' })}
                      <td className="px-3 py-1.5 text-right align-middle tabular-nums text-muted-foreground">{money(farm, shares[i] ?? 0)}</td>
                      <td className="px-3 py-1.5 text-right align-middle font-medium tabular-nums">{money(farm, prices[i]! + (shares[i] ?? 0))}</td>
                      <td className="px-2 py-1.5 align-middle">
                        <button
                          type="button"
                          aria-label={`Remove line ${i + 1}`}
                          disabled={lines.length === 1}
                          onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-muted/30 font-medium">
                <tr>
                  <td className="px-3 py-2" colSpan={5}>
                    {t('Total')}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{money(farm, totalPrice)}</td>
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums">{money(farm, shared)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(farm, totalPrice + shared)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </fieldset>

      {/* Actions stay in reach while scrolling through long purchases. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <Link href={listHref} className={buttonClasses('outline')}>
          {canSave ? t('Cancel') : t('Back')}
        </Link>
        {canSave && (
          <Button type="submit" loading={saving}>
            {purchase ? t('Save changes') : t('Save purchase')}
          </Button>
        )}
      </div>

      {purchase && (
        <Dialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={t('Delete purchase {number}?', { number: purchase.number })}
          description={t(purchase.animals === 1 ? 'This also removes the {count} animal it added to the herd, with its weighings and history.' : 'This also removes the {count} animals it added to the herd, with their weighings and history.', { count: purchase.animals })}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
                {t('Cancel')}
              </Button>
              <Button type="button" variant="destructive" loading={saving} onClick={remove}>
                {t('Delete')}
              </Button>
            </>
          }
        />
      )}
    </form>
  );
}
