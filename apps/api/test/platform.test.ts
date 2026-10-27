import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { pool } from '../src/db/client';
import { createFarm, farmInput, sentInvites } from './farm-helpers';
import { signUp } from './helpers';

// Capture invitation tokens instead of sending email.
vi.mock('../src/modules/farms/services/email.service', () => import('./farm-helpers').then((m) => m.farmEmailsMock));
vi.mock('../src/modules/platform/services/email.service', () => ({ sendFarmSuspendedEmail: async () => {} }));

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

describe('platform admin', () => {
  it('lists farms, assigns plans and suspends tenants', async () => {
    const admin = await signUp(app, { admin: true });
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c, `Admin Test Ranch ${Date.now()}`);

    expect((await owner.c.get('/api/admin/farms')).status).toBe(403);

    const list = await admin.c.get(`/api/admin/farms?q=${encodeURIComponent(farm.name)}`);
    expect(list.status).toBe(200);
    expect(list.body.farms).toHaveLength(1);
    expect(list.body.farms[0]).toMatchObject({ id: farm.id, memberCount: 1, owner: { email: owner.email } });

    expect((await admin.c.patch(`/api/admin/farms/${farm.id}/plan`, { planId: 'enterprise' })).status).toBe(204);
    const ctx = await owner.c.get(`/api/farms/${farm.slug}`);
    expect(ctx.body.subscription).toMatchObject({ planId: 'enterprise', state: 'active', source: 'manual' });
    expect(ctx.body.limits).toEqual({ animals: null, members: null });

    const stats = await admin.c.get('/api/admin/farms/stats');
    expect(stats.status).toBe(200);
    expect(stats.body.farms.paying).toBeGreaterThanOrEqual(1);
    expect(stats.body.created).toHaveLength(30);

    expect((await admin.c.post(`/api/admin/farms/${farm.id}/suspend`, { reason: 'Unpaid invoice' })).status).toBe(204);
    const suspended = await owner.c.get(`/api/farms/${farm.slug}/members`);
    expect(suspended.status).toBe(403);
    expect(suspended.body.error.code).toBe('FARM_SUSPENDED');
    // The workspace itself still loads so the UI can explain what happened.
    expect((await owner.c.get(`/api/farms/${farm.slug}`)).body.farm.suspendedReason).toBe('Unpaid invoice');

    expect((await admin.c.post(`/api/admin/farms/${farm.id}/unsuspend`)).status).toBe(204);
    expect((await owner.c.get(`/api/farms/${farm.slug}/members`)).status).toBe(200);
  });

  it('shows platform information to staff without exposing secrets', async () => {
    const admin = await signUp(app, { admin: true });
    const owner = await signUp(app);
    expect((await owner.c.get('/api/admin/system')).status).toBe(403);

    const res = await admin.c.get('/api/admin/system');
    expect(res.status).toBe(200);
    expect(res.body.database).toMatchObject({ connected: true });
    expect(res.body.modules).toEqual(expect.arrayContaining(['farms', 'subscriptions', 'platform']));
    expect(typeof res.body.billing.stripeConfigured).toBe('boolean');
    expect(JSON.stringify(res.body)).not.toContain(process.env.APP_SECRET!);
  });

  it('scopes platform staff by staff role, per action', async () => {
    const superAdmin = await signUp(app, { admin: true });
    const staff = await signUp(app, { admin: true });
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c, `Staff Test Ranch ${Date.now()}`);
    const asRole = (staffRole: string | null) => superAdmin.c.patch(`/api/admin/users/${staff.id}`, { staffRole });

    // Admins without a staff role are super admins.
    const session = await superAdmin.c.get('/api/auth/session');
    expect(session.body.user.staffRole).toBe('super_admin');
    expect(session.body.user.platformPermissions).toContain('platform.staff.manage');

    expect((await asRole('analyst')).status).toBe(200);
    expect((await staff.c.get('/api/admin/farms')).status).toBe(200);
    expect((await staff.c.get('/api/admin/users')).status).toBe(200);
    const denied = await staff.c.post(`/api/admin/farms/${farm.id}/suspend`, { reason: 'test' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PLATFORM_PERMISSION_REQUIRED');
    expect((await staff.c.get('/api/admin/audit-logs')).status).toBe(403);

    await asRole('billing');
    expect((await staff.c.patch(`/api/admin/farms/${farm.id}/plan`, { planId: 'growth' })).status).toBe(204);
    expect((await staff.c.post(`/api/admin/farms/${farm.id}/trial`, { days: 7 })).status).toBe(204);
    expect((await staff.c.post(`/api/admin/farms/${farm.id}/suspend`, {})).status).toBe(403);

    await asRole('support');
    expect((await staff.c.post(`/api/admin/farms/${farm.id}/suspend`, {})).status).toBe(204);
    expect((await staff.c.post(`/api/admin/farms/${farm.id}/unsuspend`)).status).toBe(204);
    expect((await staff.c.delete(`/api/admin/farms/${farm.id}`)).status).toBe(403);
    // Only super admins manage staff.
    expect((await staff.c.patch(`/api/admin/users/${owner.id}`, { role: 'admin' })).status).toBe(403);
    expect((await staff.c.patch(`/api/admin/users/${owner.id}`, { name: 'Renamed Owner' })).status).toBe(200);
    expect((await superAdmin.c.patch(`/api/admin/users/${owner.id}`, { staffRole: 'support' })).body.error.code).toBe('NOT_STAFF');

    // Demoting to user clears the staff role.
    await superAdmin.c.patch(`/api/admin/users/${staff.id}`, { role: 'user' });
    expect((await staff.c.get('/api/admin/farms')).status).toBe(403);
  });

  it('creates, assigns, updates and deletes custom staff roles', async () => {
    const superAdmin = await signUp(app, { admin: true });
    const staff = await signUp(app, { admin: true });
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c, `Role Test Ranch ${Date.now()}`);
    const key = `ops-${Date.now()}`;

    const list = await superAdmin.c.get('/api/admin/staff-roles');
    expect(list.status).toBe(200);
    expect(list.body.roles.filter((r: { system: boolean }) => r.system).map((r: { key: string }) => r.key)).toEqual([
      'super_admin',
      'support',
      'billing',
      'analyst',
    ]);
    expect((await superAdmin.c.patch('/api/admin/staff-roles/support', { name: 'Hacked' })).body.error.code).toBe('SYSTEM_ROLE');

    const created = await superAdmin.c.post('/api/admin/staff-roles', {
      key,
      name: 'Tenant ops',
      permissions: ['platform.tenants.view', 'platform.tenants.suspend'],
    });
    expect(created.status).toBe(201);
    expect(created.body.role).toMatchObject({ key, system: false, userCount: 0, permissions: ['platform.tenants.view', 'platform.tenants.suspend'] });
    expect((await superAdmin.c.post('/api/admin/staff-roles', { key, name: 'Again' })).body.error.code).toBe('ROLE_KEY_TAKEN');
    // The key defaults to a slug of the name.
    const slugged = await superAdmin.c.post('/api/admin/staff-roles', { name: `Read Only ${Date.now()}` });
    expect(slugged.body.role.key).toMatch(/^read-only-\d+$/);

    expect((await superAdmin.c.patch(`/api/admin/users/${staff.id}`, { staffRole: key })).status).toBe(200);
    const session = await staff.c.get('/api/auth/session');
    expect(session.body.user).toMatchObject({ staffRole: key, staffRoleName: 'Tenant ops', platformPermissions: ['platform.tenants.view', 'platform.tenants.suspend'] });
    expect((await staff.c.post(`/api/admin/farms/${farm.id}/suspend`, {})).status).toBe(204);
    expect((await staff.c.get('/api/admin/users')).status).toBe(403);
    expect((await superAdmin.c.patch(`/api/admin/users/${staff.id}`, { staffRole: 'no-such-role' })).body.error.code).toBe('UNKNOWN_STAFF_ROLE');

    // Editing the role takes effect immediately.
    await superAdmin.c.patch(`/api/admin/staff-roles/${key}`, { permissions: ['platform.tenants.view'] });
    expect((await staff.c.post(`/api/admin/farms/${farm.id}/unsuspend`)).status).toBe(403);
    expect((await superAdmin.c.get(`/api/admin/staff-roles/${key}`)).body.role.userCount).toBe(1);

    expect((await superAdmin.c.delete(`/api/admin/staff-roles/${key}`)).body.error.code).toBe('ROLE_IN_USE');
    await superAdmin.c.patch(`/api/admin/users/${staff.id}`, { staffRole: 'analyst' });
    expect((await superAdmin.c.delete(`/api/admin/staff-roles/${key}`)).status).toBe(204);
    expect((await staff.c.get('/api/admin/staff-roles')).status).toBe(403);
  });

  it('makes new staff analysts and stops staff appointing more powerful staff', async () => {
    const superAdmin = await signUp(app, { admin: true });
    const user = await signUp(app);
    const other = await signUp(app);
    expect((await superAdmin.c.patch(`/api/admin/users/${user.id}`, { role: 'admin' })).body.user).toMatchObject({ role: 'admin', staffRole: 'analyst' });

    // A custom role with staff.manage but not billing can't appoint billing staff or super admins.
    const key = `hr-${Date.now()}`;
    await superAdmin.c.post('/api/admin/staff-roles', { key, name: 'Staff HR', permissions: ['platform.users.view', 'platform.users.update', 'platform.staff.manage'] });
    await superAdmin.c.patch(`/api/admin/users/${user.id}`, { staffRole: key });
    expect((await user.c.patch(`/api/admin/users/${other.id}`, { role: 'admin', staffRole: 'billing' })).body.error.code).toBe('PERMISSION_ESCALATION');
    expect((await user.c.patch(`/api/admin/users/${other.id}`, { role: 'admin', staffRole: 'super_admin' })).body.error.code).toBe('PERMISSION_ESCALATION');
    expect((await user.c.patch(`/api/admin/users/${superAdmin.id}`, { role: 'user' })).body.error.code).toBe('PERMISSION_ESCALATION');
    expect((await user.c.post('/api/admin/staff-roles', { name: 'Billing twin', permissions: ['platform.billing.manage'] })).body.error.code).toBe('PERMISSION_ESCALATION');
    expect((await user.c.patch(`/api/admin/staff-roles/${key}`, { permissions: ['platform.users.view'] })).body.error.code).toBe('SELF_ACTION');
  });

  it('runs a manual client: tenant, deal, invoice, payment', async () => {
    const admin = await signUp(app, { admin: true });
    const client = await signUp(app);
    const name = `Manual Client Farm ${Date.now()}`;

    // Create the tenant for an existing user, straight onto a manual Growth plan.
    const created = await admin.c.post('/api/admin/farms', {
      ...farmInput(name),
      ownerEmail: client.email,
      planId: 'growth',
      currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(created.status).toBe(201);
    expect(created.body.invited).toBe(false);
    const farmId = created.body.farm.id;
    const slug = created.body.farm.slug;
    const ctx = await client.c.get(`/api/farms/${slug}`);
    expect(ctx.body.membership.role).toBe('owner');
    expect(ctx.body.subscription).toMatchObject({ planId: 'growth', source: 'manual' });

    // An owner without an account gets an invitation instead.
    const invitedEmail = `new-owner-${Date.now()}@example.com`;
    const invited = await admin.c.post('/api/admin/farms', { ...farmInput(`Invited Farm ${Date.now()}`), ownerEmail: invitedEmail });
    expect(invited.body.invited).toBe(true);
    expect(sentInvites.some((i) => i.to === invitedEmail)).toBe(true);

    // The deal: 40 seats instead of 10, advanced reports added, finance removed.
    const deal = await admin.c.patch(`/api/admin/farms/${farmId}/entitlements`, {
      limits: { members: 40 },
      capabilities: { advanced_reports: true, finance: false },
      notes: 'Contract #42',
    });
    expect(deal.status).toBe(200);
    expect(deal.body.effective.limits.members).toBe(40);
    expect(deal.body.effective.capabilities).toContain('advanced_reports');
    expect(deal.body.effective.capabilities).not.toContain('finance');
    const dealCtx = await client.c.get(`/api/farms/${slug}`);
    expect(dealCtx.body.limits.members).toBe(40);
    expect(dealCtx.body.modules).toMatchObject({ reports: 'enabled', finance: 'plan' });

    // Invoice for a year of Pro, paid in two instalments.
    const periodEnd = `${new Date().getFullYear() + 1}-12-31`;
    const invoice = await admin.c.post(`/api/admin/farms/${farmId}/invoices`, {
      description: 'Pro plan, annual',
      amount: '1,000.00',
      currency: 'usd',
      issuedAt: '1999-12-01',
      dueAt: '2000-01-01',
      planId: 'pro',
      periodEnd,
    });
    expect(invoice.status).toBe(201);
    expect(invoice.body.invoice).toMatchObject({ amount: 100000, currency: 'USD', status: 'overdue', balance: 100000 });
    expect(invoice.body.invoice.number).toMatch(/^INV-1999-\d{5}$/);
    const invoiceId = invoice.body.invoice.id;

    const subs = await admin.c.get(`/api/admin/farms/subscriptions?q=${encodeURIComponent(name)}`);
    expect(subs.body.subscriptions[0]).toMatchObject({ subscription: { planId: 'growth' }, hasOverrides: true, unpaid: { count: 1, overdue: 1 } });
    const overdue = await admin.c.get('/api/admin/farms/subscriptions?billing=overdue&pageSize=1000');
    expect(overdue.body.subscriptions.map((r: { farm: { id: string } }) => r.farm.id)).toContain(farmId);

    const pay = (body: object) => admin.c.post(`/api/admin/farms/${farmId}/invoices/${invoiceId}/payments`, body);
    expect((await pay({ amount: 400, method: 'bank_transfer', reference: 'TT-1' })).body).toMatchObject({ paidInFull: false, invoice: { paid: 40000, balance: 60000 } });
    expect((await pay({ amount: 700, method: 'cash' })).body.error.code).toBe('OVERPAYMENT');
    const rest = await pay({ amount: 600, method: 'cash' });
    expect(rest.body).toMatchObject({ paidInFull: true, planApplied: { planId: 'pro', periodEnd }, invoice: { status: 'paid', balance: 0 } });
    const paidCtx = await client.c.get(`/api/farms/${slug}`);
    expect(paidCtx.body.subscription).toMatchObject({ planId: 'pro', source: 'manual', state: 'active' });
    expect(paidCtx.body.subscription.currentPeriodEnd.slice(0, 10)).toBe(periodEnd);
    // The deal survives the plan change.
    expect(paidCtx.body.limits.members).toBe(40);

    // The client sees the invoice on their own billing page.
    const own = await client.c.get(`/api/farms/${slug}/billing/invoices`);
    expect(own.body.invoices[0]).toMatchObject({ number: invoice.body.invoice.number, status: 'paid' });

    // Voiding: only unpaid invoices.
    expect((await admin.c.post(`/api/admin/farms/${farmId}/invoices/${invoiceId}/void`)).body.error.code).toBe('INVOICE_HAS_PAYMENTS');
    const second = await admin.c.post(`/api/admin/farms/${farmId}/invoices`, { description: 'Setup', amount: 50, currency: 'USD', dueAt: periodEnd });
    expect((await admin.c.post(`/api/admin/farms/${farmId}/invoices/${second.body.invoice.id}/void`)).body.invoice.status).toBe('void');
    const all = await admin.c.get(`/api/admin/farms/invoices?q=${encodeURIComponent(name)}&status=paid`);
    expect(all.body.invoices.map((i: { id: string }) => i.id)).toEqual([invoiceId]);

    // Analysts can look but not bill or create tenants.
    const analyst = await signUp(app, { admin: true });
    await admin.c.patch(`/api/admin/users/${analyst.id}`, { staffRole: 'analyst' });
    expect((await analyst.c.get('/api/admin/farms/subscriptions')).status).toBe(200);
    expect((await analyst.c.post(`/api/admin/farms/${farmId}/invoices`, { description: 'x', amount: 1, currency: 'USD', dueAt: periodEnd })).status).toBe(403);
    expect((await analyst.c.post('/api/admin/farms', { ...farmInput('Nope Farm'), ownerEmail: 'x@example.com' })).status).toBe(403);
  });

  it('imports staff roles from CSV rows, all or nothing', async () => {
    const admin = await signUp(app, { admin: true });
    const key = `imported-${Date.now()}`;
    const bad = await admin.c.post('/api/admin/staff-roles/import', {
      rows: [
        { key, name: 'Imported', permissions: 'platform.stats.view platform.tenants.view' },
        { key: 'support', name: 'Not allowed', permissions: '' },
        { key: `${key}-2`, name: 'Typo', permissions: 'platform.nope' },
      ],
    });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.details)).toEqual(expect.arrayContaining(['rows.2.permissions']));
    expect((await admin.c.get(`/api/admin/staff-roles/${key}`)).status).toBe(404);

    const badKey = await admin.c.post('/api/admin/staff-roles/import', { rows: [{ key: 'support', name: 'Not allowed', permissions: '' }] });
    expect(Object.keys(badKey.body.error.details)).toEqual(['rows.0.key']);

    const ok = await admin.c.post('/api/admin/staff-roles/import', {
      rows: [{ key, name: 'Imported', description: 'From CSV', permissions: 'platform.stats.view;platform.tenants.view' }],
    });
    expect(ok.body).toEqual({ created: 1, updated: 0 });
    const again = await admin.c.post('/api/admin/staff-roles/import', { rows: [{ key, name: 'Imported v2', permissions: 'platform.stats.view' }] });
    expect(again.body).toEqual({ created: 0, updated: 1 });
    expect((await admin.c.get(`/api/admin/staff-roles/${key}`)).body.role).toMatchObject({ name: 'Imported v2', permissions: ['platform.stats.view'] });
  });
});
