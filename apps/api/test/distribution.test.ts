import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { pool } from '../src/db/client';
import { createFarm, inviteAndJoin } from './farm-helpers';
import { signUp } from './helpers';

vi.mock('../src/modules/farms/services/email.service', () => import('./farm-helpers').then((m) => m.farmEmailsMock));

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

async function setup() {
  const owner = await signUp(app);
  const { farm } = await createFarm(owner.c);
  const base = `/api/farms/${farm.slug}/distribution`;
  const post = async (path: string, body: object) => {
    const res = await owner.c.post(`${base}${path}`, body);
    expect(res.status).toBe(201);
    return res.body.key as string;
  };
  return { owner, farm, base, post };
}

describe('distribution: suppliers', () => {
  it('manages supplier types and suppliers with bank details, filters and import', async () => {
    const { owner, base, post } = await setup();
    const feed = await post('/supplier-types', { name: 'Feed', description: 'Feed and fodder' });
    await post('/supplier-types', { name: 'Veterinary' });
    expect((await owner.c.post(`${base}/supplier-types`, { name: 'feed' })).body.error.details.name).toBeDefined();

    const green = await post('/suppliers', {
      name: 'Green Feeds Ltd',
      code: 'SUP-001',
      typeKey: feed,
      contactPerson: 'Rahim',
      phone: '+8801711000000',
      email: 'sales@greenfeeds.test',
      city: 'Dhaka',
      bankName: 'Dutch-Bangla Bank',
      bankAccountNumber: '1234567890',
      rating: '4.5',
    });
    await post('/suppliers', { name: 'Vet Care', rating: 3, status: 'inactive' });

    const rows = (await owner.c.get(`${base}/suppliers`)).body.rows;
    expect(rows.map((r: { name: string }) => r.name)).toEqual(['Green Feeds Ltd', 'Vet Care']);
    expect(rows[0]).toMatchObject({
      key: green,
      typeName: 'Feed',
      email: 'sales@greenfeeds.test',
      bankName: 'Dutch-Bangla Bank',
      bankAccountNumber: '1234567890',
      bankAccountName: null,
      rating: 4.5,
      status: 1,
    });
    expect(rows[1]).toMatchObject({ bankName: null, status: 0 });

    // Filters and search.
    expect((await owner.c.get(`${base}/suppliers?type=${feed}`)).body.rows).toHaveLength(1);
    expect((await owner.c.get(`${base}/suppliers?status=0`)).body.rows[0].name).toBe('Vet Care');
    expect((await owner.c.get(`${base}/suppliers?ratingMin=4`)).body.rows).toHaveLength(1);
    expect((await owner.c.get(`${base}/suppliers?q=rahim`)).body.rows).toHaveLength(1);

    // Validation.
    const bad = await owner.c.post(`${base}/suppliers`, { name: 'X', email: 'not-an-email', rating: 6, code: 'sup-001' });
    expect(Object.keys(bad.body.error.details).sort()).toEqual(['email', 'rating']);
    expect((await owner.c.post(`${base}/suppliers`, { name: 'X', code: 'sup-001' })).body.error.details.code).toBeDefined();

    // Clearing the bank fields empties bank_details.
    await owner.c.put(`${base}/suppliers/${green}`, { name: 'Green Feeds Ltd', code: 'SUP-001', bankName: '' });
    expect((await owner.c.get(`${base}/suppliers?type=`)).body.rows[0]).toMatchObject({ bankName: null, typeName: null, email: null });

    // Import matches the type by name; status toggles.
    const imported = await owner.c.post(`${base}/suppliers/import`, {
      rows: [{ name: 'Agro Tools', type: 'veterinary', bank_name: 'City Bank', bank_branch: 'Gulshan', status: 'Active' }],
    });
    expect(imported.status).toBe(201);
    const agro = (await owner.c.get(`${base}/suppliers?q=agro`)).body.rows[0];
    expect(agro).toMatchObject({ typeName: 'Veterinary', bankName: 'City Bank', bankBranch: 'Gulshan' });
    expect((await owner.c.post(`${base}/suppliers/toggle-status`, { keys: [agro.key] })).body.updated).toBe(1);

    // A type in use can't be deleted.
    const vet = (await owner.c.get(`${base}/supplier-types`)).body.rows.find((r: { name: string }) => r.name === 'Veterinary').key;
    expect((await owner.c.delete(`${base}/supplier-types/${vet}`)).body.error.code).toBe('IN_USE');
    expect((await owner.c.delete(`${base}/suppliers/${agro.key}`)).status).toBe(204);
    expect((await owner.c.delete(`${base}/supplier-types/${vet}`)).status).toBe(204);
  });
});

describe('distribution: customers', () => {
  it('stores preferred breeds and weight range, and enforces permissions', async () => {
    const { owner, farm, base, post } = await setup();
    const slaughter = await post('/customer-types', { name: 'Slaughterhouse' });
    const city = await post('/customers', {
      name: 'City Meat House',
      code: 'CUS-001',
      typeKey: slaughter,
      preferredBreeds: 'Brahman,  Sahiwal ,',
      preferredWeightMin: '400',
      preferredWeightMax: '600',
    });
    await post('/customers', { name: 'Walk-in buyer' });

    const rows = (await owner.c.get(`${base}/customers`)).body.rows;
    expect(rows[0]).toMatchObject({ key: city, typeName: 'Slaughterhouse', preferredBreeds: 'Brahman, Sahiwal', preferredWeightMin: 400, preferredWeightMax: 600 });
    expect(rows[1]).toMatchObject({ preferredBreeds: null, preferredWeightMin: null, preferredWeightMax: null });

    await owner.c.put(`${base}/customers/${city}`, { name: 'City Meat House', code: 'CUS-001', preferredWeightMin: 450 });
    expect((await owner.c.get(`${base}/customers`)).body.rows[0]).toMatchObject({ preferredBreeds: null, preferredWeightMin: 450, preferredWeightMax: null });

    const imported = await owner.c.post(`${base}/customers/import`, {
      rows: [{ name: 'Auction Yard', type: 'Slaughterhouse', preferred_breeds: 'Angus', preferred_weight_max: '700' }],
    });
    expect(imported.status).toBe(201);
    expect((await owner.c.get(`${base}/customers?q=auction`)).body.rows[0]).toMatchObject({ preferredBreeds: 'Angus', preferredWeightMax: 700 });
    expect((await owner.c.get(`${base}/customers/export`)).body.rows).toHaveLength(3);

    // Accountants manage customers; workers don't see them.
    const accountant = await inviteAndJoin(app, owner, farm.slug, 'accountant');
    expect((await accountant.c.post(`${base}/customers`, { name: 'Trader Joe' })).status).toBe(201);
    expect((await accountant.c.get(`${base}/customer-types`)).status).toBe(200);
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    expect((await worker.c.get(`${base}/customers`)).status).toBe(403);
    expect((await worker.c.get(`${base}/suppliers`)).status).toBe(403);
  });
});
