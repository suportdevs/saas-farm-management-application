'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { FINISH_RECEIVE_STATUS, linePrice, type FinishReceiveDetail } from '@kit/shared';
import { PageHeader } from '@/components/app/page-header';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useCan, useFarm } from '@/modules/farms/context';
import { CatalogSelect } from '@/modules/products/components/catalog-select';
import { money } from '../money';

/** One line as typed (numbers stay text until saved). */
type Line = { id: number; key: string; productSizeKey: string; productSizeName: string; quantity: string; rate: string };

const num = (v: string) => (v.trim() === '' ? 0 : Number(v) || 0);
let nextId = 1;
const emptyLine = (): Line => ({ id: nextId++, key: '', productSizeKey: '', productSizeName: '', quantity: '', rate: '' });

/**
 * Create / edit a finish receive: order, warehouse, who received it, and one
 * line per product size (quantity × rate = price). Pending receives can be
 * saved, processed or deleted; processed ones are read-only.
 */
export function FinishReceiveForm({ receive }: { receive?: FinishReceiveDetail }) {
  const router = useRouter();
  const { farm } = useFarm();
  const processed = receive?.status === FINISH_RECEIVE_STATUS.processed;
  const canSave = useCan(receive ? 'feed.finish_receive_edit' : 'feed.finish_receive_create') && !processed;
  const canProcess = useCan('feed.finish_receive_process') && !!receive && !processed;
  const canDelete = useCan('feed.finish_receive_delete') && !!receive && !processed;
  const listHref = `/farms/${farm.slug}/feed/finish-receives`;

  const [header, setHeader] = useState({
    orderNo: receive?.orderNo ?? '',
    receiveDate: receive?.receiveDate ?? new Date().toISOString().slice(0, 10),
    warehouseKey: receive?.warehouseKey ?? '',
    receivedByKey: receive?.receivedByKey ?? '',
    note: receive?.note ?? '',
  });
  const [lines, setLines] = useState<Line[]>(() =>
    receive?.lines.length
      ? receive.lines.map((l) => ({ id: nextId++, key: l.key, productSizeKey: l.productSizeKey, productSizeName: l.productSizeName, quantity: String(l.quantity), rate: String(l.rate) }))
      : [emptyLine()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'process' | 'delete' | null>(null);
  const [confirm, setConfirm] = useState<'process' | 'delete' | null>(null);

  const set = (field: keyof typeof header, value: string) => setHeader((h) => ({ ...h, [field]: value }));
  const setLine = (id: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const prices = lines.map((l) => linePrice(num(l.quantity), num(l.rate)));
  const totalQuantity = lines.reduce((sum, l) => sum + num(l.quantity), 0);
  const totalPrice = prices.reduce((a, b) => a + b, 0);

  /** Runs an action; API field errors land under their fields. */
  const run = async (kind: 'save' | 'process' | 'delete', action: () => Promise<unknown>, message: string) => {
    setBusy(kind);
    setErrors({});
    try {
      await action();
      toast.success(message);
      router.push(listHref);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? 'Invalid'])));
      toast.error(errorMessage(err));
      setBusy(null);
      setConfirm(null);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const body = { ...header, items: lines.map(({ key, productSizeKey, quantity, rate }) => ({ key, productSizeKey, quantity, rate })) };
    void run(
      'save',
      () => (receive ? api.put(`/farms/${farm.slug}/feed/finish-receives/${receive.key}`, body) : api.post(`/farms/${farm.slug}/feed/finish-receives`, body)),
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
        description="Finished goods received into a warehouse. Save keeps it pending; Process locks it."
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

      {processed && (
        <Alert>
          This receive is processed. It can be viewed and downloaded but no longer changed.
        </Alert>
      )}

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

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b pb-3">
            <div className="space-y-1">
              <CardTitle className="text-base">Products ({lines.length})</CardTitle>
              {errors.items && <p className="text-sm text-destructive">{errors.items}</p>}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              <Plus className="h-4 w-4" /> Add product
            </Button>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Product *</th>
                  <th className="w-36 px-3 py-2 font-medium">Quantity *</th>
                  <th className="w-40 px-3 py-2 font-medium">Rate *</th>
                  <th className="w-40 px-3 py-2 text-right font-medium">Price</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l, i) => (
                  <tr key={l.id}>
                    <td className="px-2 py-1.5 align-top">
                      <CatalogSelect
                        resource="product-sizes"
                        aria-label={`Product of line ${i + 1}`}
                        value={l.productSizeKey}
                        initialLabel={l.productSizeName || undefined}
                        onChange={(v) => setLine(l.id, { productSizeKey: v })}
                        placeholder="Choose a product"
                        invalid={!!lineError(i, 'productSizeKey')}
                      />
                      {lineError(i, 'productSizeKey') && <p className="mt-1 text-xs text-destructive">{lineError(i, 'productSizeKey')}</p>}
                    </td>
                    {(['quantity', 'rate'] as const).map((field) => (
                      <td key={field} className="px-2 py-1.5 align-top">
                        <Input
                          aria-label={`${field} of line ${i + 1}`}
                          type="number"
                          min={0}
                          step={field === 'quantity' ? '0.001' : '0.01'}
                          inputMode="decimal"
                          className="h-10"
                          value={l[field]}
                          onChange={(e) => setLine(l.id, { [field]: e.target.value })}
                          aria-invalid={!!lineError(i, field) || undefined}
                        />
                        {lineError(i, field) && <p className="mt-1 text-xs text-destructive">{lineError(i, field)}</p>}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right align-middle font-medium tabular-nums">{money(farm, prices[i]!)}</td>
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
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/30 font-medium">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 tabular-nums">{totalQuantity.toLocaleString()}</td>
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums">{money(farm, totalPrice)}</td>
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
        {canProcess && (
          <Button type="button" variant="outline" onClick={() => setConfirm('process')} disabled={!!busy}>
            <CheckCircle2 className="h-4 w-4" /> Process
          </Button>
        )}
        {canSave && (
          <Button type="submit" loading={busy === 'save'}>
            {receive ? 'Save changes' : 'Save as pending'}
          </Button>
        )}
      </div>

      {receive && (
        <Dialog
          open={confirm !== null}
          onClose={() => setConfirm(null)}
          title={confirm === 'delete' ? `Delete finish receive ${receive.orderNo}?` : `Process finish receive ${receive.orderNo}?`}
          description={
            confirm === 'delete'
              ? 'The receive and its lines are deleted.'
              : 'The receive and all its lines are marked Processed and locked — they can no longer be edited or deleted. Unsaved changes on this page are not included.'
          }
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              {confirm === 'delete' ? (
                <Button type="button" variant="destructive" loading={busy === 'delete'} onClick={() => run('delete', () => api.delete(`/farms/${farm.slug}/feed/finish-receives/${receive.key}`), 'Finish receive deleted')}>
                  Delete
                </Button>
              ) : (
                <Button type="button" loading={busy === 'process'} onClick={() => run('process', () => api.post(`/farms/${farm.slug}/feed/finish-receives/${receive.key}/process`), 'Finish receive processed')}>
                  Process
                </Button>
              )}
            </>
          }
        />
      )}
    </form>
  );
}
