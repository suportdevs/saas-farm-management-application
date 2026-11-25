'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { FINISH_RECEIVE_STATUS, finishReceiveStatusLabel, type FinishReceiveBulkResult, type FinishReceiveRow } from '@kit/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api';
import { useCan, useFarm } from '@/modules/farms/context';
import { money } from '../money';

type Action = 'confirm' | 'reset';

/**
 * The finish receive list with row selection: Confirm (Pending → Processed)
 * and Reset (Processed → Pending) work on every selected receive at once.
 */
export function FinishReceiveTable({ rows }: { rows: FinishReceiveRow[] }) {
  const router = useRouter();
  const { farm } = useFarm();
  const canConfirm = useCan('feed.finish_receive_process');
  const canReset = useCan('feed.finish_receive_reset');
  const canSelect = canConfirm || canReset;
  const base = `/farms/${farm.slug}/feed/finish-receives`;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ask, setAsk] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (key: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.key));
  const picked = rows.filter((r) => selected.has(r.key));
  const pending = picked.filter((r) => r.status === FINISH_RECEIVE_STATUS.pending).length;
  const processed = picked.length - pending;

  const run = async (action: Action) => {
    setBusy(true);
    try {
      const result = await api.post<FinishReceiveBulkResult>(`/farms/${farm.slug}/feed/finish-receives/bulk-${action}`, { keys: [...selected] });
      const verb = action === 'confirm' ? 'confirmed' : 'reset to pending';
      toast.success(`${result.changed} ${result.changed === 1 ? 'receive' : 'receives'} ${verb}${result.skipped ? ` · ${result.skipped} already ${action === 'confirm' ? 'processed' : 'pending'}` : ''}`);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
      setAsk(null);
    }
  };

  return (
    <>
      {selected.size > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b bg-primary/5 px-4 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          {canConfirm && (
            <Button size="sm" onClick={() => setAsk('confirm')} disabled={!pending}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
            </Button>
          )}
          {canReset && (
            <Button size="sm" variant="outline" onClick={() => setAsk('reset')} disabled={!processed}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      )}
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {canSelect && (
              <th className="w-10 px-4 py-3">
                <Checkbox aria-label="Select all" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.key)) : new Set())} />
              </th>
            )}
            <th className="px-4 py-3 font-medium">Order no.</th>
            <th className="px-4 py-3 font-medium">Receive date</th>
            <th className="px-4 py-3 font-medium">Warehouse</th>
            <th className="px-4 py-3 font-medium">Received by</th>
            <th className="px-4 py-3 text-right font-medium">Items</th>
            <th className="px-4 py-3 text-right font-medium">Quantity</th>
            <th className="px-4 py-3 text-right font-medium">Total amount</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.key} className={selected.has(r.key) ? 'bg-primary/5' : 'hover:bg-muted/30'}>
              {canSelect && (
                <td className="px-4 py-3">
                  <Checkbox aria-label={`Select ${r.orderNo}`} checked={selected.has(r.key)} onChange={(e) => toggle(r.key, e.target.checked)} />
                </td>
              )}
              <td className="px-4 py-3 font-medium">
                <Link href={`${base}/${r.key}`} className="text-primary hover:underline">
                  {r.orderNo}
                </Link>
              </td>
              <td className="px-4 py-3 tabular-nums">{r.receiveDate}</td>
              <td className="px-4 py-3">{r.warehouseName}</td>
              <td className="px-4 py-3">{r.receivedByName ?? '—'}</td>
              <td className="px-4 py-3 text-right tabular-nums">{r.items}</td>
              <td className="px-4 py-3 text-right tabular-nums">{r.totalQuantity.toLocaleString()}</td>
              <td className="px-4 py-3 text-right font-medium tabular-nums">{money(farm, r.totalPrice)}</td>
              <td className="px-4 py-3">
                <Badge variant={r.status === FINISH_RECEIVE_STATUS.processed ? 'primary' : 'outline'}>{finishReceiveStatusLabel(r.status)}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog
        open={ask !== null}
        onClose={() => setAsk(null)}
        title={ask === 'confirm' ? `Confirm ${pending} ${pending === 1 ? 'receive' : 'receives'}?` : `Reset ${processed} ${processed === 1 ? 'receive' : 'receives'}?`}
        description={
          ask === 'confirm'
            ? 'Pending receives and their items become Processed and are locked. Selected receives that are already processed are left as they are.'
            : 'Processed receives and their items go back to Pending so they can be edited again. Selected pending receives are left as they are.'
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setAsk(null)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => ask && run(ask)}>
              {ask === 'confirm' ? 'Confirm' : 'Reset'}
            </Button>
          </>
        }
      />
    </>
  );
}
