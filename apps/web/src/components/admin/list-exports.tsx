'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { planName, type Plan, type ManualInvoice, type PlatformFarm, type PlatformSubscription } from '@kit/shared';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { downloadFile, toCsv } from '@/lib/csv';

const money = (minor: number) => (minor / 100).toFixed(2);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const stamp = () => new Date().toISOString().slice(0, 10);

/** Fetches every row matching the page's filters (up to 1,000) and saves it as CSV. */
function ExportButton<T>({ load, toRows, headers, filename }: { load: () => Promise<T[]>; toRows: (rows: T[]) => unknown[][]; headers: string[]; filename: string }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const rows = await load();
      downloadFile(`${filename}-${stamp()}.csv`, toCsv(headers, toRows(rows)));
      toast.success(`Exported ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" variant="outline" onClick={run} loading={busy}>
      {!busy && <Download className="h-4 w-4" />} Export CSV
    </Button>
  );
}

const withAll = (query: string) => {
  const qs = new URLSearchParams(query);
  qs.set('page', '1');
  qs.set('pageSize', '1000');
  return qs.toString();
};

export function TenantsExport({ query }: { query: string }) {
  return (
    <ExportButton<PlatformFarm>
      filename="tenants"
      headers={['id', 'name', 'slug', 'type', 'country', 'city', 'owner_name', 'owner_email', 'plan', 'state', 'source', 'members', 'suspended', 'created_at']}
      load={async () => (await api.get<{ farms: PlatformFarm[] }>(`/admin/farms?${withAll(query)}`)).farms}
      toRows={(rows) =>
        rows.map((f) => [
          f.id,
          f.name,
          f.slug,
          f.type,
          f.country,
          f.city ?? '',
          f.owner?.name ?? '',
          f.owner?.email ?? '',
          f.subscription.planName,
          f.subscription.state,
          f.subscription.source ?? '',
          f.memberCount,
          f.suspendedAt ? 'yes' : 'no',
          day(f.createdAt),
        ])
      }
    />
  );
}

export function SubscriptionsExport({ query }: { query: string }) {
  return (
    <ExportButton<PlatformSubscription>
      filename="subscriptions"
      headers={[
        'tenant',
        'slug',
        'owner_email',
        'plan',
        'state',
        'source',
        'interval',
        'period_end',
        'trial_ends',
        'cancel_at_period_end',
        'mrr_usd',
        'seat_limit',
        'animal_limit',
        'custom_deal',
        'unpaid_invoices',
        'overdue_invoices',
        'balance_due',
      ]}
      load={async () => (await api.get<{ subscriptions: PlatformSubscription[] }>(`/admin/farms/subscriptions?${withAll(query)}`)).subscriptions}
      toRows={(rows) =>
        rows.map((r) => [
          r.farm.name,
          r.farm.slug,
          r.owner?.email ?? '',
          r.subscription.planName,
          r.subscription.state,
          r.subscription.source ?? '',
          r.subscription.interval ?? '',
          day(r.subscription.currentPeriodEnd),
          day(r.subscription.trialEndsAt),
          r.subscription.cancelAtPeriodEnd ? 'yes' : 'no',
          money(r.mrr),
          r.limits.members ?? 'unlimited',
          r.limits.animals ?? 'unlimited',
          r.hasOverrides ? 'yes' : 'no',
          r.unpaid.count,
          r.unpaid.overdue,
          r.unpaid.balances.map((b) => `${money(b.amount)} ${b.currency}`).join('; '),
        ])
      }
    />
  );
}

export function InvoicesExport({ query, plans }: { query: string; plans: Pick<Plan, 'id' | 'name'>[] }) {
  return (
    <ExportButton<ManualInvoice>
      filename="invoices"
      headers={['number', 'tenant', 'description', 'status', 'currency', 'amount', 'paid', 'balance', 'issued', 'due', 'plan', 'paid_through', 'paid_at', 'payments']}
      load={async () => (await api.get<{ invoices: ManualInvoice[] }>(`/admin/farms/invoices?${withAll(query)}`)).invoices}
      toRows={(rows) =>
        rows.map((i) => [
          i.number,
          i.farm.name,
          i.description,
          i.status,
          i.currency,
          money(i.amount),
          money(i.paid),
          money(i.balance),
          i.issuedAt,
          i.dueAt,
          planName(plans, i.planId),
          i.periodEnd ?? '',
          day(i.paidAt),
          i.payments.map((p) => `${money(p.amount)} ${p.method}${p.reference ? ` (${p.reference})` : ''} ${p.paidAt}`).join('; '),
        ])
      }
    />
  );
}
