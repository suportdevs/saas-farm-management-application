'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CheckCircle2, ListPlus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { FINISH_RECEIVE_STATUS, linePrice, type FinishReceiveDetail, type FinishReceiveProductOption } from '@kit/shared';
import { PageHeader } from '@/components/app/page-header';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useCan, useFarm } from '@/modules/farms/context';
import { CatalogSelect } from '@/modules/products/components/catalog-select';
import { money } from '../money';

/** Quantity, rate and amount as typed; amount ÷ quantity sets the rate, quantity × rate the amount. */
type Amounts = { quantity: string; rate: string; amount: string };

/** One item of the receive (shown in "Items", saved with the receive). */
type Line = Amounts & { id: number; key: string; productSizeKey: string; productSizeName: string; unitName: string };

/** One row of the product search results. */
type PickRow = Amounts & FinishReceiveProductOption & { checked: boolean };

const num = (v: string) => (v.trim() === '' ? 0 : Number(v) || 0);
const round = (n: number, digits: number) => String(Math.round(n * 10 ** digits) / 10 ** digits);
let nextId = 1;

/**
 * Keeps quantity, rate and amount in step after one of them changes:
 * amount typed → rate = amount ÷ quantity; quantity or rate typed → amount = quantity × rate.
 */
function withAmounts<T extends Amounts>(row: T, field: keyof Amounts, value: string): T {
  const next = { ...row, [field]: value };
  const quantity = num(next.quantity);
  if (field === 'amount') next.rate = quantity > 0 && value.trim() !== '' ? round(num(value) / quantity, 2) : next.rate;
  else next.amount = next.quantity.trim() !== '' && next.rate.trim() !== '' ? round(linePrice(quantity, num(next.rate)), 2) : '';
  return next;
}

/**
 * Create / edit a finish receive. Products are added through a picker: search
 * by category and name, type quantity (ticks the row), rate or amount, then
 * "Add items" puts the ticked rows in the items list below. Nothing is saved
 * until the final Save. Pending receives can be saved, confirmed or deleted;
 * confirmed (processed) ones are read-only until reset.
 */
export function FinishReceiveForm({ receive }: { receive?: FinishReceiveDetail }) {
  const router = useRouter();
  const { farm } = useFarm();
  const processed = receive?.status === FINISH_RECEIVE_STATUS.processed;
  const canSave = useCan(receive ? 'feed.finish_receive_edit' : 'feed.finish_receive_create') && !processed;
  const canConfirm = useCan('feed.finish_receive_process') && !!receive && !processed;
  const canReset = useCan('feed.finish_receive_reset') && !!receive && processed;
  const canDelete = useCan('feed.finish_receive_delete') && !!receive && !processed;
  const listHref = `/farms/${farm.slug}/feed/finish-receives`;
  const apiBase = `/farms/${farm.slug}/feed/finish-receives`;

  const [header, setHeader] = useState({
    orderNo: receive?.orderNo ?? '',
    receiveDate: receive?.receiveDate ?? new Date().toISOString().slice(0, 10),
    warehouseKey: receive?.warehouseKey ?? '',
    receivedByKey: receive?.receivedByKey ?? '',
    note: receive?.note ?? '',
  });
  const [lines, setLines] = useState<Line[]>(() =>
    (receive?.lines ?? []).map((l) => ({
      id: nextId++,
      key: l.key,
      productSizeKey: l.productSizeKey,
      productSizeName: l.productSizeName,
      unitName: l.unitName ?? '',
      quantity: String(l.quantity),
      rate: String(l.rate),
      amount: String(l.price),
    })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'confirm' | 'reset' | 'delete' | null>(null);
  const [confirm, setConfirm] = useState<'confirm' | 'reset' | 'delete' | null>(null);

  // Product picker.
  const [pick, setPick] = useState({ category: '', q: '' });
  const [results, setResults] = useState<PickRow[] | null>(null);
  const [searching, setSearching] = useState(false);

  const set = (field: keyof typeof header, value: string) => setHeader((h) => ({ ...h, [field]: value }));

  const search = async () => {
    setSearching(true);
    try {
      const qs = new URLSearchParams(Object.entries(pick).filter(([, v]) => v));
      const { products } = await api.get<{ products: FinishReceiveProductOption[] }>(`/farms/${farm.slug}/feed/finish-receives/product-search?${qs}`);
      setResults(products.map((p) => ({ ...p, checked: false, quantity: '', rate: '', amount: '' })));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSearching(false);
    }
  };
  const clearSearch = () => {
    setPick({ category: '', q: '' });
    setResults(null);
  };

  /** A picker amount changed; quantity above 0 ticks the row (and 0 / empty unticks it). */
  const setPickAmount = (key: string, field: keyof Amounts, value: string) =>
    setResults((rs) => rs!.map((r) => (r.key === key ? { ...withAmounts(r, field, value), ...(field === 'quantity' ? { checked: num(value) > 0 } : {}) } : r)));
  const setPickChecked = (key: string, checked: boolean) => setResults((rs) => rs!.map((r) => (r.key === key ? { ...r, checked } : r)));
  const allChecked = !!results?.length && results.every((r) => r.checked);

  /** Ticked rows go to the items list (a product already there gets the new quantity and rate). */
  const addItems = () => {
    const picked = (results ?? []).filter((r) => r.checked);
    if (!picked.length) return toast.error('Tick at least one product (type a quantity to tick it).');
    const missing = picked.filter((r) => !(num(r.quantity) > 0) || r.rate.trim() === '');
    if (missing.length) return toast.error(`Enter quantity and rate (or amount) for: ${missing.map((r) => r.name).join(', ')}`);
    let updated = 0;
    const next = [...lines];
    for (const r of picked) {
      const existing = next.findIndex((l) => l.productSizeKey === r.key);
      const values = { quantity: r.quantity, rate: r.rate, amount: r.amount };
      if (existing >= 0) {
        next[existing] = { ...next[existing]!, ...values };
        updated++;
      } else {
        next.push({ id: nextId++, key: '', productSizeKey: r.key, productSizeName: r.name, unitName: r.unitName ?? '', ...values });
      }
    }
    setLines(next);
    setErrors((e) => ({ ...e, items: '' }));
    setResults((rs) => rs!.map((r) => ({ ...r, checked: false, quantity: '', rate: '', amount: '' })));
    toast.success(`${picked.length} ${picked.length === 1 ? 'item' : 'items'} added${updated ? ` (${updated} already listed — updated)` : ''}. Save to keep them.`);
  };

  const setLineAmount = (id: number, field: keyof Amounts, value: string) => setLines((ls) => ls.map((l) => (l.id === id ? withAmounts(l, field, value) : l)));
  const prices = lines.map((l) => linePrice(num(l.quantity), num(l.rate)));
  const totalQuantity = lines.reduce((sum, l) => sum + num(l.quantity), 0);
  const totalPrice = prices.reduce((a, b) => a + b, 0);

  /** Runs an action; API field errors land under their fields. */
  const run = async (kind: 'save' | 'confirm' | 'reset' | 'delete', action: () => Promise<unknown>, message: string, stay = false) => {
    setBusy(kind);
    setErrors({});
    try {
      await action();
      toast.success(message);
      if (stay) {
        setBusy(null);
        setConfirm(null);
        router.refresh();
      } else {
        router.push(listHref);
        router.refresh();
      }
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? 'Invalid'])));
      toast.error(errorMessage(err));
      setBusy(null);
      setConfirm(null);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!lines.length) {
      setErrors({ items: 'Add at least one product' });
      return;
    }
    const body = { ...header, items: lines.map(({ key, productSizeKey, quantity, rate }) => ({ key, productSizeKey, quantity, rate })) };
    void run(
      'save',
      () => (receive ? api.put(`${apiBase}/${receive.key}`, body) : api.post(apiBase, body)),
      receive ? 'Finish receive updated' : 'Finish receive saved as pending',
    );
  };

  const lineError = (i: number, field: string) => errors[`items.${i}.${field}`];

  return (
    <form onSubmit={save} className="space-y-5 pb-20">
      <PageHeader
        compact
        eyebrow="Feed"
        title={receive ? `Finish receive ${receive.orderNo}` : 'New finish receive'}
        description="Search products, add them as items, then save. Save keeps it pending; Confirm locks it."
        actions={
          receive && (
            <div className="flex items-center gap-2">
              <Badge variant={processed ? 'primary' : 'outline'}>{processed ? 'Processed' : 'Pending'}</Badge>
              {canDelete && (
                <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirm('delete')}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              )}
            </div>
          )
        }
      />

      {processed && <Alert>This receive is confirmed (processed). It can be viewed and downloaded; reset it to make changes.</Alert>}

      <fieldset disabled={!canSave || !!busy} className="space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Receive details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="fr-order" label="Order no." error={errors.orderNo}>
              <Input id="fr-order" value={header.orderNo} onChange={(e) => set('orderNo', e.target.value)} placeholder="FR-2026-001" required />
            </Field>
            <Field id="fr-date" label="Receive date" error={errors.receiveDate}>
              <Input id="fr-date" type="date" value={header.receiveDate} onChange={(e) => set('receiveDate', e.target.value)} required />
            </Field>
            <Field id="fr-warehouse" label="Warehouse" error={errors.warehouseKey}>
              <CatalogSelect id="fr-warehouse" resource="warehouses" value={header.warehouseKey} initialLabel={receive?.warehouseName} onChange={(v) => set('warehouseKey', v)} placeholder="Choose a warehouse" />
            </Field>
            <Field id="fr-by" label="Received by" error={errors.receivedByKey}>
              <CatalogSelect id="fr-by" resource="employees" value={header.receivedByKey} initialLabel={receive?.receivedByName ?? undefined} onChange={(v) => set('receivedByKey', v)} placeholder="Choose an employee" clearable />
            </Field>
            <Field id="fr-note" label="Note" error={errors.note} className="sm:col-span-2 lg:col-span-4">
              <Textarea id="fr-note" rows={2} value={header.note} onChange={(e) => set('note', e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        {canSave && (
          <Card className="overflow-hidden">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base">Add product</CardTitle>
              <CardDescription>Search, type a quantity (the row is ticked) and a rate or amount, then Add items.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end">
                <Field id="fr-pick-category" label="Category">
                  <CatalogSelect id="fr-pick-category" resource="categories" value={pick.category} onChange={(v) => setPick((p) => ({ ...p, category: v }))} placeholder="Any category" clearable />
                </Field>
                <Field id="fr-pick-q" label="Product name">
                  <Input
                    id="fr-pick-q"
                    value={pick.q}
                    onChange={(e) => setPick((p) => ({ ...p, q: e.target.value }))}
                    onKeyDown={(e) => {
                      // Enter searches instead of submitting the receive.
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void search();
                      }
                    }}
                    placeholder="Name or code"
                  />
                </Field>
                <div className="flex gap-2">
                  <Button type="button" onClick={search} loading={searching}>
                    {!searching && <Search className="h-4 w-4" />} Search
                  </Button>
                  <Button type="button" variant="outline" onClick={clearSearch}>
                    <X className="h-4 w-4" /> Clear
                  </Button>
                </div>
              </div>

              {results && (
                <div className="overflow-hidden rounded-lg border">
                  <div className="max-h-96 overflow-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="sticky top-0 z-10 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="w-10 px-3 py-2">
                            <Checkbox aria-label="Tick all" checked={allChecked} disabled={!results.length} onChange={(e) => setResults((rs) => rs!.map((r) => ({ ...r, checked: e.target.checked })))} />
                          </th>
                          <th className="w-10 px-2 py-2 font-medium">#</th>
                          <th className="px-3 py-2 font-medium">Product</th>
                          <th className="px-3 py-2 font-medium">Unit</th>
                          <th className="w-32 px-2 py-2 font-medium">Quantity</th>
                          <th className="w-32 px-2 py-2 font-medium">Rate</th>
                          <th className="w-36 px-2 py-2 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {results.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                              No products match. Check the category or name.
                            </td>
                          </tr>
                        )}
                        {results.map((r, i) => (
                          <tr key={r.key} className={r.checked ? 'bg-primary/5' : undefined}>
                            <td className="px-3 py-1.5">
                              <Checkbox aria-label={`Tick ${r.name}`} checked={r.checked} onChange={(e) => setPickChecked(r.key, e.target.checked)} />
                            </td>
                            <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-1.5">
                              <span className="font-medium">{r.name}</span>
                              {(r.code || r.categoryName) && <span className="block text-xs text-muted-foreground">{[r.code, r.categoryName].filter(Boolean).join(' · ')}</span>}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.unitName ?? '—'}</td>
                            {(['quantity', 'rate', 'amount'] as const).map((field) => (
                              <td key={field} className="px-2 py-1.5">
                                <Input
                                  aria-label={`${field} of ${r.name}`}
                                  type="number"
                                  min={0}
                                  step={field === 'quantity' ? '0.001' : '0.01'}
                                  inputMode="decimal"
                                  className="h-9"
                                  value={r[field]}
                                  onChange={(e) => setPickAmount(r.key, field, e.target.value)}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2">
                    <span className="text-xs text-muted-foreground">
                      {results.filter((r) => r.checked).length} of {results.length} ticked
                    </span>
                    <Button type="button" size="sm" onClick={addItems}>
                      <ListPlus className="h-4 w-4" /> Add items
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="overflow-hidden">
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-base">Items ({lines.length})</CardTitle>
            {canSave && <CardDescription>Added items stay here until you save the receive.</CardDescription>}
            {errors.items && <p className="text-sm text-destructive">{errors.items}</p>}
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="w-32 px-2 py-2 font-medium">Quantity</th>
                  <th className="w-32 px-2 py-2 font-medium">Rate</th>
                  <th className="w-36 px-2 py-2 font-medium">Amount</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                      No items yet — search products above and Add items.
                    </td>
                  </tr>
                )}
                {lines.map((l, i) => (
                  <tr key={l.id}>
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{l.productSizeName}</span>
                      {lineError(i, 'productSizeKey') && <p className="mt-1 text-xs text-destructive">{lineError(i, 'productSizeKey')}</p>}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{l.unitName || '—'}</td>
                    {(['quantity', 'rate', 'amount'] as const).map((field) => (
                      <td key={field} className="px-2 py-1.5 align-top">
                        <Input
                          aria-label={`${field} of item ${i + 1}`}
                          type="number"
                          min={0}
                          step={field === 'quantity' ? '0.001' : '0.01'}
                          inputMode="decimal"
                          className="h-9"
                          value={l[field]}
                          onChange={(e) => setLineAmount(l.id, field, e.target.value)}
                          aria-invalid={!!lineError(i, field === 'amount' ? 'rate' : field) || undefined}
                        />
                        {field !== 'amount' && lineError(i, field) && <p className="mt-1 text-xs text-destructive">{lineError(i, field)}</p>}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 align-middle">
                      <button
                        type="button"
                        aria-label={`Remove item ${i + 1}`}
                        onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/30 font-medium">
                <tr>
                  <td className="px-3 py-2" colSpan={3}>
                    Total
                  </td>
                  <td className="px-3 py-2 tabular-nums">{totalQuantity.toLocaleString()}</td>
                  <td />
                  <td className="px-3 py-2 tabular-nums">{money(farm, totalPrice)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </fieldset>

      {/* Actions stay in reach while scrolling through long receives. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <Link href={listHref} className={buttonClasses('outline')}>
          {canSave ? 'Cancel' : 'Back'}
        </Link>
        {canReset && (
          <Button type="button" variant="outline" onClick={() => setConfirm('reset')} disabled={!!busy}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        )}
        {canConfirm && (
          <Button type="button" variant="outline" onClick={() => setConfirm('confirm')} disabled={!!busy}>
            <CheckCircle2 className="h-4 w-4" /> Confirm
          </Button>
        )}
        {canSave && (
          <Button type="submit" loading={busy === 'save'}>
            {receive ? 'Save changes' : 'Save'}
          </Button>
        )}
      </div>

      {receive && (
        <Dialog
          open={confirm !== null}
          onClose={() => setConfirm(null)}
          title={
            confirm === 'delete'
              ? `Delete finish receive ${receive.orderNo}?`
              : confirm === 'reset'
                ? `Reset finish receive ${receive.orderNo}?`
                : `Confirm finish receive ${receive.orderNo}?`
          }
          description={
            confirm === 'delete'
              ? 'The receive and its items are deleted.'
              : confirm === 'reset'
                ? 'The receive and its items go back to Pending, so they can be edited again.'
                : 'The receive and all its items are marked Processed and locked. Unsaved changes on this page are not included.'
          }
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              {confirm === 'delete' && (
                <Button type="button" variant="destructive" loading={busy === 'delete'} onClick={() => run('delete', () => api.delete(`/farms/${farm.slug}/feed/finish-receives/${receive.key}`), 'Finish receive deleted')}>
                  Delete
                </Button>
              )}
              {confirm === 'confirm' && (
                <Button type="button" loading={busy === 'confirm'} onClick={() => run('confirm', () => api.post(`/farms/${farm.slug}/feed/finish-receives/${receive.key}/process`), 'Finish receive confirmed')}>
                  Confirm
                </Button>
              )}
              {confirm === 'reset' && (
                <Button type="button" loading={busy === 'reset'} onClick={() => run('reset', () => api.post(`/farms/${farm.slug}/feed/finish-receives/bulk-reset`, { keys: [receive.key] }), 'Finish receive reset to pending', true)}>
                  Reset
                </Button>
              )}
            </>
          }
        />
      )}
    </form>
  );
}
