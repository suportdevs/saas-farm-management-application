import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { pool } from '../src/db/client';
import { createFarm, farmInput, sentInvites } from './farm-helpers';
import { PASSWORD, signUp, uniqueEmail } from './helpers';

vi.mock('../src/modules/farms/services/email.service', () => import('./farm-helpers').then((m) => m.farmEmailsMock));

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

type Client = Awaited<ReturnType<typeof signUp>>['c'];
const myOrgs = async (c: Client) => (await c.get('/api/organizations')).body.organizations as { id: string; name: string; role: string; farmCount: number }[];

describe('organizations', () => {
  it('puts a new farm in the owner’s organization, and later farms in the same one', async () => {
    const owner = await signUp(app);
    const first = await createFarm(owner.c, 'North Ridge Dairy');

    let orgs = await myOrgs(owner.c);
    expect(orgs).toHaveLength(1);
    expect(orgs[0]).toMatchObject({ name: 'North Ridge Dairy', role: 'owner', farmCount: 1 });
    const ctx = await owner.c.get(`/api/farms/${first.farm.slug}`);
    expect(ctx.body.organization).toEqual({ id: orgs[0]!.id, name: 'North Ridge Dairy', role: 'owner' });

    await createFarm(owner.c, 'South Ridge Beef');
    orgs = await myOrgs(owner.c);
    expect(orgs).toHaveLength(1);
    expect(orgs[0]!.farmCount).toBe(2);

    const detail = await owner.c.get(`/api/organizations/${orgs[0]!.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.farms.map((f: { name: string }) => f.name)).toEqual(['North Ridge Dairy', 'South Ridge Beef']);
    expect(detail.body.farms[0]).toMatchObject({ planId: 'pro', memberCount: 1 });

    expect((await owner.c.patch(`/api/organizations/${orgs[0]!.id}`, { name: 'Ridge Group' })).body.organization.name).toBe('Ridge Group');
    expect((await owner.c.delete(`/api/organizations/${orgs[0]!.id}`)).body.error.code).toBe('ORGANIZATION_HAS_FARMS');
  });

  it('gives organization owners and admins access to every farm, but not members', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c);
    const [org] = await myOrgs(owner.c);

    const admin = await signUp(app);
    const member = await signUp(app);
    expect((await owner.c.post(`/api/organizations/${org!.id}/members`, { email: admin.email, role: 'admin' })).status).toBe(201);
    expect((await owner.c.post(`/api/organizations/${org!.id}/members`, { email: member.email })).status).toBe(201);
    expect((await owner.c.post(`/api/organizations/${org!.id}/members`, { email: member.email })).body.error.code).toBe('ALREADY_MEMBER');
    expect((await owner.c.post(`/api/organizations/${org!.id}/members`, { email: uniqueEmail('nobody') })).body.error.code).toBe('USER_NOT_FOUND');

    // Admin: acts as a manager on every farm, without being on the farm team.
    const farms = (await admin.c.get('/api/farms')).body.farms;
    expect(farms).toHaveLength(1);
    expect(farms[0]).toMatchObject({ id: farm.id, role: 'manager', organization: { id: org!.id } });
    const ctx = await admin.c.get(`/api/farms/${farm.slug}`);
    expect(ctx.status).toBe(200);
    expect(ctx.body.membership.role).toBe('manager');
    expect(ctx.body.membership.permissions).toContain('members.invite');
    expect(ctx.body.membership.permissions).not.toContain('billing.manage');
    expect((await admin.c.post(`/api/farms/${farm.slug}/invitations`, { email: uniqueEmail('hand'), role: 'worker' })).status).toBe(201);
    expect((await admin.c.delete(`/api/farms/${farm.slug}`, { confirm: farm.name })).status).toBe(403);

    // Admins add farms to the organization; members don't see its farms.
    expect((await admin.c.post('/api/farms', { ...farmInput('Admin Farm'), organizationId: org!.id })).status).toBe(201);
    expect((await member.c.get('/api/farms')).body.farms).toHaveLength(0);
    expect((await member.c.get(`/api/farms/${farm.slug}`)).status).toBe(404);
    expect((await member.c.post('/api/farms', { ...farmInput('Member Farm'), organizationId: org!.id })).body.error.code).toBe('ORG_ROLE_REQUIRED');

    // Promote the member to owner: full control of the farm.
    expect((await owner.c.patch(`/api/organizations/${org!.id}/members/${member.id}`, { role: 'owner' })).status).toBe(200);
    expect((await member.c.get(`/api/farms/${farm.slug}`)).body.membership.role).toBe('owner');
  });

  it('enforces organization role rules', async () => {
    const owner = await signUp(app);
    await createFarm(owner.c);
    const [org] = await myOrgs(owner.c);
    const admin = await signUp(app);
    await owner.c.post(`/api/organizations/${org!.id}/members`, { email: admin.email, role: 'admin' });

    expect((await admin.c.patch(`/api/organizations/${org!.id}/members/${owner.id}`, { role: 'member' })).body.error.code).toBe('OWNER_REQUIRED');
    const someone = await signUp(app);
    expect((await admin.c.post(`/api/organizations/${org!.id}/members`, { email: someone.email, role: 'owner' })).body.error.code).toBe('OWNER_REQUIRED');
    expect((await owner.c.delete(`/api/organizations/${org!.id}/members/${owner.id}`)).body.error.code).toBe('LAST_OWNER');
    expect((await admin.c.delete(`/api/organizations/${org!.id}`)).body.error.code).toBe('OWNER_REQUIRED');

    // Anyone may leave.
    expect((await admin.c.delete(`/api/organizations/${org!.id}/members/${admin.id}`)).status).toBe(204);
    expect((await admin.c.get(`/api/organizations/${org!.id}`)).status).toBe(404);
  });

  it('lets the platform open an organization for a client who joins later', async () => {
    const staff = await signUp(app, { admin: true });
    const clientEmail = uniqueEmail('client');
    const created = await staff.c.post('/api/admin/farms', { ...farmInput('Client Farm'), ownerEmail: clientEmail, organizationName: 'Client Co-op' });
    expect(created.status).toBe(201);
    expect(created.body.invited).toBe(true);

    const client = await signUp(app, { email: clientEmail });
    const { token } = sentInvites.findLast((i) => i.to === clientEmail)!;
    expect((await client.c.post('/api/farms/invitations/accept', { token })).status).toBe(200);
    const orgs = await myOrgs(client.c);
    expect(orgs).toEqual([expect.objectContaining({ name: 'Client Co-op', role: 'owner', farmCount: 1 })]);

    // A second farm for the same client goes into their organization.
    const second = await staff.c.post('/api/admin/farms', { ...farmInput('Client Farm Two'), ownerEmail: clientEmail, organizationId: orgs[0]!.id });
    expect(second.status).toBe(201);
    expect((await myOrgs(client.c))[0]!.farmCount).toBe(2);
  });

  it('hands an organization to an admin when its owner deletes their account', async () => {
    const owner = await signUp(app);
    await createFarm(owner.c);
    const [org] = await myOrgs(owner.c);
    const admin = await signUp(app);
    await owner.c.post(`/api/organizations/${org!.id}/members`, { email: admin.email, role: 'admin' });

    expect((await owner.c.delete('/api/users/me', { password: PASSWORD })).status).toBe(204);
    expect((await myOrgs(admin.c))[0]).toMatchObject({ id: org!.id, role: 'owner' });
  });
});
