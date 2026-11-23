'use client';

import {
  planName,
  type AdminUser,
  type AuditLogEntry,
  type ManualInvoice,
  type Plan,
  type PlatformFarm,
  type PlatformOrganization,
  type PlatformSubscription,
} from '@kit/shared';
import { ExportMenu } from '@/components/app/export-menu';
import { api } from '@/lib/api';
import type { ExportCriterion } from '@/lib/table-export';

const money = (minor: number) => (minor / 100).toFixed(2);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/**
 * Download menu (Excel, CSV, PDF, Print, Copy) over every row matching the
 * page's filters (up to 1,000).
 */
function ExportButton<T>({
  load,
  toRows,
  headers,
  filename,
  criteria,
}: {
  load: () => Promise<T[]>;
  toRows: (rows: T[]) => unknown[][];
  headers: string[];
  filename: string;
  /** The page's search and filters, printed on the PDF / Excel / print header. */
  criteria?: ExportCriterion[];
}) {
  const title = filename.charAt(0).toUpperCase() + filename.slice(1);
  return (
    <ExportMenu
      load={async () => {
        const rows = await load();
        // Record count and date are on the document header.
        return { filename, title, headers, rows: toRows(rows), criteria: criteria ?? [] };
      }}
    />
  );
}

const withAll = (query: string) => {
  const qs = new URLSearchParams(query);
  qs.set('page', '1');
  qs.set('pageSize', '1000');
  return qs.toString();
};

export function TenantsExport({ query, criteria }: { query: string; criteria?: ExportCriterion[] }) {
  return (
    <ExportButton<PlatformFarm>
      criteria={criteria}
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

export function SubscriptionsExport({ query, criteria }: { query: string; criteria?: ExportCriterion[] }) {
  return (
    <ExportButton<PlatformSubscription>
      criteria={criteria}
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

export function InvoicesExport({ query, plans, criteria }: { query: string; plans: Pick<Plan, 'id' | 'name'>[]; criteria?: ExportCriterion[] }) {
  return (
    <ExportButton<ManualInvoice>
      criteria={criteria}
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

export function UsersExport({ query, criteria }: { query: string; criteria?: ExportCriterion[] }) {
  return (
    <ExportButton<AdminUser>
      criteria={criteria}
      filename="users"
      headers={['name', 'email', 'role', 'status', 'last_sign_in', 'joined']}
      load={async () => (await api.get<{ users: AdminUser[] }>(`/admin/users?${withAll(query)}`)).users}
      toRows={(rows) =>
        rows.map((u) => [
          u.name,
          u.email,
          u.staffRoleName ?? u.role,
          u.bannedAt ? 'suspended' : u.emailVerified ? 'active' : 'unverified',
          day(u.lastLoginAt),
          day(u.createdAt),
        ])
      }
    />
  );
}

export function AuditLogExport({ query, criteria }: { query: string; criteria?: ExportCriterion[] }) {
  return (
    <ExportButton<AuditLogEntry>
      criteria={criteria}
      filename="audit-log"
      headers={['when', 'action', 'actor', 'target_type', 'target_id', 'ip', 'user_agent']}
      load={async () => (await api.get<{ events: AuditLogEntry[] }>(`/admin/audit-logs?${withAll(query)}`)).events}
      toRows={(rows) =>
        rows.map((e) => [
          e.createdAt.replace('T', ' ').slice(0, 19),
          e.action,
          e.actor?.email ?? (typeof e.metadata.email === 'string' ? e.metadata.email : ''),
          e.targetType ?? '',
          e.targetId ?? '',
          e.ip ?? '',
          e.userAgent ?? '',
        ])
      }
    />
  );
}

export function OrganizationsExport({ query, criteria }: { query: string; criteria?: ExportCriterion[] }) {
  return (
    <ExportButton<PlatformOrganization>
      criteria={criteria}
      filename="clients"
      headers={['organization', 'owner_name', 'owner_email', 'farms', 'members', 'created_at']}
      load={async () => (await api.get<{ organizations: PlatformOrganization[] }>(`/admin/organizations?${withAll(query)}`)).organizations}
      toRows={(rows) => rows.map((o) => [o.name, o.owner?.name ?? '', o.owner?.email ?? '', o.farmCount, o.memberCount, day(o.createdAt)])}
    />
  );
}
