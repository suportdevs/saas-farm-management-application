import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { PlatformInfo } from '@kit/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { requireAdmin, serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'Platform · Admin' };

export default async function AdminSystemPage() {
  await requireAdmin('platform.stats.view');
  const info = await serverFetch<PlatformInfo>('/admin/system');
  if (!info) throw new Error('Failed to load platform information');
  const { app, runtime, database, email, billing, security, jobs, storage, modules } = info;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Status label="API" ok value={`Up ${uptime(app.uptimeSeconds)}`} hint={`Since ${formatDate(app.startedAt, { dateStyle: 'medium', timeStyle: 'short' })}`} />
        <Status
          label="Database"
          ok={database.connected && !database.pendingMigrations.length}
          value={!database.connected ? 'Unreachable' : database.pendingMigrations.length ? `${database.pendingMigrations.length} migration(s) pending` : 'Connected'}
          hint={database.connected ? `${database.version} · ${bytes(database.sizeBytes)}` : 'Check DATABASE_URL and that Postgres is running'}
        />
        <Status label="Email" ok={email.smtpConfigured} value={email.smtpConfigured ? 'SMTP configured' : 'Not configured'} hint={email.smtpConfigured ? `${email.host}:${email.port}` : 'Set SMTP_HOST in apps/api/.env'} />
        <Status
          label="Online billing"
          ok={billing.stripeConfigured}
          value={billing.stripeConfigured ? 'Stripe connected' : 'Stripe off'}
          hint={billing.stripeConfigured ? (billing.webhookConfigured ? 'Webhook secret set' : 'STRIPE_WEBHOOK_SECRET missing') : 'Only manual invoices — set STRIPE_SECRET_KEY'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <InfoCard title="Application" description="Where and how this API is running.">
          <Row label="Name" value={app.name} />
          <Row label="Environment" value={<Badge variant={app.environment === 'production' ? 'success' : 'info'}>{app.environment}</Badge>} />
          <Row label="Version" value={app.version} />
          <Row label="Web URL" value={app.webUrl} />
          <Row label="API port" value={app.port} />
          <Row label="Node.js" value={runtime.node} />
          <Row label="Operating system" value={runtime.os} />
          <Row label="Memory in use" value={`${runtime.memoryMb} MB`} />
          <Row label="Upload folder" value={storage.uploadDir} />
        </InfoCard>

        <InfoCard title="Database" description="PostgreSQL connection and migrations.">
          <Row label="Status" value={<OnOff on={database.connected} onLabel="Connected" offLabel="Unreachable" />} />
          <Row label="Version" value={database.version ?? '—'} />
          <Row label="Database name" value={database.name ?? '—'} />
          <Row label="Size" value={bytes(database.sizeBytes)} />
          <Row
            label="Migrations"
            value={database.pendingMigrations.length ? <Badge variant="warning">{database.pendingMigrations.length} pending — run npm run db:migrate</Badge> : <Badge variant="success">Up to date</Badge>}
          />
          {database.pendingMigrations.length > 0 && <Row label="Pending" value={database.pendingMigrations.join(', ')} />}
        </InfoCard>

        <InfoCard title="Billing & trials" description="Subscriptions setup. Keys are never shown, only whether they are set.">
          <Row label="Stripe secret key" value={<OnOff on={billing.stripeConfigured} onLabel="Set" offLabel="Not set" />} />
          <Row label="Stripe webhook secret" value={<OnOff on={billing.webhookConfigured} onLabel="Set" offLabel="Not set" />} />
          <Row label="Free trial" value={billing.trialDays ? `${billing.trialDays} days on ${billing.trialPlan}` : 'Off'} />
          <Row label="Active plans" value={billing.plans} />
          <Row label="Archived plans" value={billing.archivedPlans} />
        </InfoCard>

        <InfoCard title="Email" description="Outgoing mail and verification.">
          <Row label="SMTP" value={<OnOff on={email.smtpConfigured} onLabel="Configured" offLabel="Not configured" />} />
          <Row label="Server" value={email.host ? `${email.host}:${email.port}` : '—'} />
          <Row label="From address" value={email.from} />
          <Row label="Email verification" value={email.verification} />
          <Row label="Welcome email" value={email.welcomeEmail ? 'On' : 'Off'} />
        </InfoCard>

        <InfoCard title="Security" description="Sign-in protection and sessions.">
          <Row label="Login lockout" value={security.loginMaxAttempts ? `After ${security.loginMaxAttempts} failed tries, ${security.lockoutMinutes} min` : 'Off'} />
          <Row label="Captcha" value={security.captcha.length ? security.captcha.join(', ') : 'Off'} />
          <Row label="Rate-limit store" value={security.rateLimitStore} />
          <Row label="Session length" value={`${security.sessionTtlDays} days`} />
          <Row label="Auto-admin emails" value={security.adminEmails} />
        </InfoCard>

        <InfoCard title="Background jobs" description="Queue worker for emails, reminders and cleanup.">
          <Row label="Worker" value={jobs.workerInProcess ? 'Runs inside the API' : 'Separate worker process'} />
          <Row label="Concurrency" value={jobs.concurrency} />
          <Row label="Poll interval" value={`${jobs.pollIntervalMs} ms`} />
          <Row label="Pending jobs" value={jobs.pending} />
          <Row label="Failed jobs" value={jobs.failed ? <Badge variant="destructive">{jobs.failed}</Badge> : 0} />
        </InfoCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Modules</CardTitle>
          <CardDescription>Feature modules loaded by the API.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {modules.map((m) => (
            <Badge key={m} variant="primary">
              {m}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Status({ label, value, hint, ok }: { label: string; value: string; hint: string; ok: boolean }) {
  return (
    <Card className="h-full p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${ok ? 'bg-success' : 'bg-warning'}`} />
        {label}
      </div>
      <p className="mt-1 text-xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

function InfoCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y text-sm">{children}</dl>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all text-right font-medium">{value}</dd>
    </div>
  );
}

function OnOff({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return <Badge variant={on ? 'success' : 'warning'}>{on ? onLabel : offLabel}</Badge>;
}

/** 93784 → "1d 2h 3m" */
function uptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

function bytes(n: number | null) {
  if (n === null) return '—';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
