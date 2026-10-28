import type { Express } from 'express';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { db, pool } from '../src/db/client';
import { users } from '../src/db/schema';
import { farmMembers, farms } from '../src/modules/farms/models';
import { farmSubscriptions } from '../src/modules/subscriptions/models';
import { createFarm, inviteAndJoin } from './farm-helpers';
import { client, PASSWORD, signUp } from './helpers';

// Capture invitation tokens instead of sending email.
vi.mock('../src/modules/farms/services/email.service', () => import('./farm-helpers').then((m) => m.farmEmailsMock));

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

/** Data is never removed: deleting marks rows deleted (deleted_at / deleted_by) and hides them. */
describe('soft delete', () => {
  it('fills created_by from the signed-in user', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c, `Audit Ranch ${Date.now()}`);
    const [row] = await db.select().from(farms).where(eq(farms.id, farm.id));
    expect(row).toMatchObject({ createdBy: owner.id, updatedBy: owner.id, deletedAt: null });
  });

  it('removes a member by marking the row deleted, and brings it back when they rejoin', async () => {
    const owner = await signUp(app);
    const { farm } = await createFarm(owner.c, `Member Ranch ${Date.now()}`);
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');

    expect((await owner.c.delete(`/api/farms/${farm.slug}/members/${worker.id}`)).status).toBe(204);
    const members = await owner.c.get(`/api/farms/${farm.slug}/members`);
    expect(members.body.members.map((m: { userId: string }) => m.userId)).not.toContain(worker.id);
    expect((await worker.c.get(`/api/farms/${farm.slug}`)).status).toBe(404);

    const [row] = await db.select().from(farmMembers).where(and(eq(farmMembers.farmId, farm.id), eq(farmMembers.userId, worker.id)));
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.deletedBy).toBe(owner.id);

    // Invited again: the same row comes back, with the new role.
    const again = await inviteAndJoin(app, owner, farm.slug, 'viewer', worker);
    expect(again.id).toBe(worker.id);
    const [revived] = await db.select().from(farmMembers).where(and(eq(farmMembers.farmId, farm.id), eq(farmMembers.userId, worker.id)));
    expect(revived).toMatchObject({ role: 'viewer', deletedAt: null, deletedBy: null });
  });

  it('deletes a farm by marking it and its rows deleted; the address can be used again', async () => {
    const owner = await signUp(app);
    const name = `Gone Ranch ${Date.now()}`;
    const { farm } = await createFarm(owner.c, name);

    expect((await owner.c.delete(`/api/farms/${farm.slug}`, { confirm: name })).status).toBe(204);
    expect((await owner.c.get(`/api/farms/${farm.slug}`)).status).toBe(404);
    expect((await owner.c.get('/api/farms')).body.farms.map((f: { id: string }) => f.id)).not.toContain(farm.id);

    const [row] = await db.select().from(farms).where(eq(farms.id, farm.id));
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.deletedBy).toBe(owner.id);
    const [member] = await db.select().from(farmMembers).where(eq(farmMembers.farmId, farm.id));
    expect(member?.deletedAt).toBeInstanceOf(Date);
    const [sub] = await db.select().from(farmSubscriptions).where(eq(farmSubscriptions.farmId, farm.id));
    expect(sub?.deletedAt).toBeInstanceOf(Date);

    // A new farm with the same name gets the same address back.
    const { farm: next } = await createFarm(owner.c, name);
    expect(next.slug).toBe(farm.slug);
    expect(next.id).not.toBe(farm.id);
  });

  it('deleting your own account keeps the row but anonymizes it; the email can sign up again', async () => {
    const user = await signUp(app);
    expect((await user.c.delete('/api/users/me', { password: PASSWORD })).status).toBe(204);

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({ name: 'Deleted user', email: `deleted-${user.id}@deleted.invalid`, passwordHash: null });
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect((await user.c.get('/api/auth/session')).body.user).toBeNull();
    expect((await client(app).post('/api/auth/login', { email: user.email, password: PASSWORD })).status).toBe(401);

    const again = await signUp(app, { email: user.email });
    expect(again.id).not.toBe(user.id);
  });

  it('an admin-deleted account keeps its name and email, cannot sign in, and frees the email', async () => {
    const admin = await signUp(app, { admin: true });
    const user = await signUp(app);
    expect((await admin.c.delete(`/api/admin/users/${user.id}`)).status).toBe(204);

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({ email: user.email, name: 'Test User', deletedBy: admin.id });
    expect((await admin.c.get(`/api/admin/users/${user.id}`)).status).toBe(404);
    const list = await admin.c.get(`/api/admin/users?q=${encodeURIComponent(user.email)}`);
    expect(list.body.users).toHaveLength(0);
    expect((await user.c.get('/api/auth/session')).body.user).toBeNull();

    const again = await signUp(app, { email: user.email });
    expect(again.id).not.toBe(user.id);
  });
});
