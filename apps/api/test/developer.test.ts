import { eq, sql } from 'drizzle-orm';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@kit/shared';
import { createApp } from '../src/app';
import { db, pool } from '../src/db/client';
import { users } from '../src/db/schema';
import { createFarm } from './farm-helpers';
import { signUp } from './helpers';

vi.mock('../src/modules/farms/services/email.service', () => import('./farm-helpers').then((m) => m.farmEmailsMock));

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

/** A developer account (set in the database, like in production). */
async function developer() {
  const dev = await signUp(app, { admin: true });
  await db.update(users).set({ isDeveloper: true }).where(eq(users.id, dev.id));
  return dev;
}

/** A farm on the Starter plan (trial over): no Feed, no data export, 25 animals. */
async function starterFarm() {
  const owner = await signUp(app);
  const { farm } = await createFarm(owner.c);
  await db.execute(sql`update farm_subscriptions set trial_ends_at = now() - interval '1 day' where farm_id = ${farm.id}`);
  return { owner, farm, api: `/api/farms/${farm.slug}` };
}

describe('developer account', () => {
  it('is owner of every farm with every permission, whatever the plan', async () => {
    const dev = await developer();
    const { owner, api } = await starterFarm();

    // The farm's own owner hits the Starter plan…
    expect((await owner.c.get(`${api}/feed/finish-receives`)).status).toBe(402);
    // …the developer (not even a member) doesn't.
    const ctx = await dev.c.get(api);
    expect(ctx.status).toBe(200);
    expect(ctx.body.membership.role).toBe('owner');
    expect(ctx.body.membership.permissions).toHaveLength(PERMISSIONS.length);
    expect(Object.values(ctx.body.modules).every((s) => s === 'enabled')).toBe(true);
    expect(ctx.body.capabilities).toEqual(expect.arrayContaining(['feed', 'data_export']));
    expect((await dev.c.get(`${api}/feed/finish-receives`)).status).toBe(200);
    expect((await dev.c.get(`${api}/herd/export`)).status).toBe(200);

    // The farm switcher lists every farm for the developer, unlocked (no lock icons).
    const list = (await dev.c.get('/api/farms')).body.farms;
    const listed = list.find((f: { slug: string }) => api.endsWith(f.slug));
    expect(listed).toMatchObject({ role: 'owner' });
    expect(Object.values(listed.modules).every((s) => s === 'enabled')).toBe(true);
    expect(listed.permissions).toHaveLength(PERMISSIONS.length);
    // An ordinary user's switcher only shows their own farms.
    expect((await owner.c.get('/api/farms')).body.farms).toHaveLength(1);
  });

  it('is not held to plan limits, and opens suspended farms', async () => {
    const dev = await developer();
    const { owner, farm, api } = await starterFarm();
    const rows = Array.from({ length: 26 }, (_, i) => ({ tag: `D-${i}`, sex: 'female' }));
    expect((await owner.c.post(`${api}/herd/import`, { rows })).status).toBe(402);
    expect((await dev.c.post(`${api}/herd/import`, { rows })).status).toBe(201);

    await db.execute(sql`update farms set suspended_at = now() where id = ${farm.id}`);
    expect((await owner.c.get(`${api}/herd`)).status).toBe(403);
    expect((await dev.c.get(`${api}/herd`)).status).toBe(200);
  });

  it('has full platform access and is protected from other admins', async () => {
    const dev = await developer();
    const me = await dev.c.get('/api/auth/me');
    expect(me.body.user).toMatchObject({ isDeveloper: true, staffRole: 'super_admin' });
    expect((await dev.c.get('/api/admin/users')).status).toBe(200);

    // Even a super admin can't suspend, edit, impersonate or delete the developer.
    const admin = await signUp(app, { admin: true });
    expect((await admin.c.post(`/api/admin/users/${dev.id}/ban`, { reason: 'x' })).body.error.code).toBe('DEVELOPER_PROTECTED');
    expect((await admin.c.patch(`/api/admin/users/${dev.id}`, { role: 'user' })).body.error.code).toBe('DEVELOPER_PROTECTED');
    expect((await admin.c.post(`/api/admin/users/${dev.id}/impersonate`)).status).toBe(403);
    expect((await admin.c.delete(`/api/admin/users/${dev.id}`)).body.error.code).toBe('DEVELOPER_PROTECTED');
    // A demoted staff role doesn't take platform access away from the developer.
    await db.update(users).set({ staffRole: 'analyst' }).where(eq(users.id, dev.id));
    expect((await dev.c.get('/api/admin/users')).status).toBe(200);
  });
});
