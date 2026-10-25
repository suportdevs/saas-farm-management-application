'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Ban, CalendarPlus, Crown, PlayCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Plan, PlanId, PlatformFarm, PlatformPermission } from '@kit/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api';

type Action = 'plan' | 'trial' | 'suspend' | 'delete' | null;

/** Support actions for a tenant: manual plans, trial extensions, suspension, deletion. */
/** Tenant actions, each shown only to staff whose role allows it. */
export function FarmAdminActions({ farm, plans, permissions }: { farm: PlatformFarm; plans: Plan[]; permissions: PlatformPermission[] }) {
  const can = (p: PlatformPermission) => permissions.includes(p);
  const router = useRouter();
  const [open, setOpen] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  // Archived plans can't be given out, except to keep a farm on the one it already has.
  const choices = plans.filter((p) => !p.archived || p.id === farm.subscription.planId);
  const [planId, setPlanId] = useState<PlanId>(
    farm.subscription.source === 'manual' ? farm.subscription.planId : (choices.find((p) => p.custom)?.id ?? choices[0]?.id ?? 'free'),
  );
  const [periodEnd, setPeriodEnd] = useState('');
  const [days, setDays] = useState('14');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');

  const run = async (fn: () => Promise<unknown>, message: string, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      setOpen(null);
      after ? after() : router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const close = () => setOpen(null);
  return (
    <div className="flex flex-wrap gap-2">
      {can('platform.billing.manage') && (
        <>
          <Button variant="outline" size="sm" onClick={() => setOpen('plan')}>
            <Crown className="h-4 w-4" /> Set plan
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpen('trial')}>
            <CalendarPlus className="h-4 w-4" /> Extend trial
          </Button>
        </>
      )}
      {can('platform.tenants.suspend') &&
        (farm.suspendedAt ? (
          <Button variant="outline" size="sm" loading={busy} onClick={() => run(() => api.post(`/admin/farms/${farm.id}/unsuspend`), 'Farm restored')}>
            <PlayCircle className="h-4 w-4" /> Restore
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => setOpen('suspend')}>
            <Ban className="h-4 w-4" /> Suspend
          </Button>
        ))}
      {can('platform.tenants.delete') && (
        <Button variant="destructive" size="sm" onClick={() => setOpen('delete')}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      )}

      <Dialog
        open={open === 'plan'}
        onClose={close}
        title="Set plan manually"
        description="For invoiced and enterprise customers. Any Stripe subscription is cancelled. Choose Starter to remove a manual plan."
        footer={
          <Button
            loading={busy}
            onClick={() =>
              run(
                () => api.patch(`/admin/farms/${farm.id}/plan`, { planId, currentPeriodEnd: periodEnd ? new Date(`${periodEnd}T23:59:59Z`).toISOString() : null }),
                'Plan updated',
              )
            }
          >
            Save plan
          </Button>
        }
      >
        <div className="space-y-4">
          <Field id="plan" label="Plan">
            <Select id="plan" className="w-full" value={planId} onChange={(e) => setPlanId(e.target.value as PlanId)}>
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {planId !== 'free' && (
            <Field id="period-end" label="Contract end date (optional)" hint="Leave empty for an open-ended plan.">
              <Input id="period-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </Field>
          )}
        </div>
      </Dialog>

      <Dialog
        open={open === 'trial'}
        onClose={close}
        title="Extend trial"
        description="Adds days to the current trial (or starts a new one from today)."
        footer={
          <Button loading={busy} onClick={() => run(() => api.post(`/admin/farms/${farm.id}/trial`, { days: Number(days) }), 'Trial extended')}>
            Extend
          </Button>
        }
      >
        <Field id="days" label="Days">
          <Input id="days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog
        open={open === 'suspend'}
        onClose={close}
        title={`Suspend ${farm.name}?`}
        description="Members lose access immediately and owners are emailed. Data is kept."
        footer={
          <Button variant="destructive" loading={busy} onClick={() => run(() => api.post(`/admin/farms/${farm.id}/suspend`, { reason }), 'Farm suspended')}>
            Suspend farm
          </Button>
        }
      >
        <Field id="reason" label="Reason (shown to the farm)">
          <Input id="reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog
        open={open === 'delete'}
        onClose={close}
        title={`Delete ${farm.name}?`}
        description="Permanently deletes the farm and all of its data, and cancels its subscription."
        footer={
          <Button
            variant="destructive"
            disabled={confirm !== farm.name}
            loading={busy}
            onClick={() => run(() => api.delete(`/admin/farms/${farm.id}`), 'Farm deleted', () => router.push('/admin/farms'))}
          >
            Delete permanently
          </Button>
        }
      >
        <Field id="confirm" label={`Type "${farm.name}" to confirm`}>
          <Input id="confirm" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </Dialog>
    </div>
  );
}
