import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { splitSharedCost } from '@kit/shared';
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
  const api = `/api/farms/${farm.slug}`;
  const post = async (path: string, body: object) => {
    const res = await owner.c.post(`${api}${path}`, body);
    expect(res.status).toBe(201);
    return res.body.key as string;
  };
  return { owner, farm, api, post };
}

const baseBody = {
  number: 'PO-001',
  purchaseDate: '2026-03-01',
  sourceType: 'haat',
  haatName: 'Gabtoli haat',
  transportCost: '1000',
  brokerFee: '500',
  tollCost: '200',
  otherCost: '300',
};

describe('purchases: cost split', () => {
  it('splits shared costs by price share and keeps every cent', () => {
    expect(splitSharedCost([60000, 40000], 2000)).toEqual([1200, 800]);
    const parts = splitSharedCost([100, 100, 100], 100);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
    expect(splitSharedCost([0, 0], 10)).toEqual([5, 5]);
  });
});

describe('purchases', () => {
  it('creates a purchase, adds its animals to the herd and splits the shared costs', async () => {
    const { owner, api, post } = await setup();
    const supplier = await post('/distribution/suppliers', { code: 'S-1', name: 'Rahim Traders' });
    const broker = await post('/distribution/suppliers', { code: 'B-1', name: 'Karim Broker' });
    const batch = await post('/herd/batches', { number: 'B-2026-03', arrivalDate: '2026-03-01' });

    const res = await owner.c.post(`${api}/purchases`, {
      ...baseBody,
      supplierKey: supplier,
      brokerKey: broker,
      batchKey: batch,
      items: [
        { tag: 'PB-1', sex: 'male', type: 'steer', breed: 'Sahiwal', price: '60000', entryWeightKg: '210' },
        { tag: 'PB-2', name: 'Lali', sex: 'female', price: '40000' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ number: 'PO-001', sourceType: 'haat', haatName: 'Gabtoli haat', supplierName: 'Rahim Traders', brokerName: 'Karim Broker', batchName: 'B-2026-03', animals: 2, totalPrice: 100000, sharedCost: 2000, totalLanded: 102000 });
    expect(res.body.items).toEqual([
      expect.objectContaining({ tag: 'PB-1', price: 60000, allocatedSharedCost: 1200, landedCost: 61200, entryWeightKg: 210 }),
      expect.objectContaining({ tag: 'PB-2', name: 'Lali', price: 40000, allocatedSharedCost: 800, landedCost: 40800, entryWeightKg: null }),
    ]);

    // The animals are in the herd: purchased, in the batch, with the entry weight and an arrival weighing.
    const herd = (await owner.c.get(`${api}/herd?q=PB-`)).body.rows;
    expect(herd).toHaveLength(2);
    expect(herd.find((a: { tag: string }) => a.tag === 'PB-1')).toMatchObject({ origin: 'purchased', purchaseDate: '2026-03-01', batchName: 'B-2026-03', weight: 210, sex: 'male', breed: 'Sahiwal' });
    const weights = (await owner.c.get(`${api}/herd/weights`)).body.rows;
    expect(weights).toEqual([expect.objectContaining({ animalName: 'PB-1', weight: 210, weighType: 'arrival', weighDate: '2026-03-01' })]);

    // List, search and filters.
    const list = await owner.c.get(`${api}/purchases`);
    expect(list.body.pagination.total).toBe(1);
    expect((await owner.c.get(`${api}/purchases?q=gabtoli`)).body.rows).toHaveLength(1);
    expect((await owner.c.get(`${api}/purchases?source_type=farmer`)).body.rows).toHaveLength(0);
    expect((await owner.c.get(`${api}/purchases?from=2026-04-01`)).body.rows).toHaveLength(0);

    // Purchase items: every animal line with its purchase, same search and filters.
    const items = await owner.c.get(`${api}/purchase-items`);
    expect(items.status).toBe(200);
    expect(items.body.pagination.total).toBe(2);
    expect(items.body.rows[0]).toMatchObject({ number: 'PO-001', purchaseDate: '2026-03-01', sourceType: 'haat', supplierName: 'Rahim Traders', batchName: 'B-2026-03', tag: 'PB-1', price: 60000, allocatedSharedCost: 1200, landedCost: 61200 });
    expect((await owner.c.get(`${api}/purchase-items?q=PB-2`)).body.rows).toEqual([expect.objectContaining({ tag: 'PB-2', name: 'Lali' })]);
    expect((await owner.c.get(`${api}/purchase-items?source_type=farmer`)).body.rows).toHaveLength(0);

    // Batch, supplier and broker filters on both lists; animal type and animal on the items.
    expect((await owner.c.get(`${api}/purchases?batch=${batch}&supplier=${supplier}&broker=${broker}`)).body.rows).toHaveLength(1);
    expect((await owner.c.get(`${api}/purchases?broker=${supplier}`)).body.rows).toHaveLength(0);
    expect((await owner.c.get(`${api}/purchase-items?supplier=${supplier}&batch=${batch}`)).body.pagination.total).toBe(2);
    expect((await owner.c.get(`${api}/purchase-items?broker=${supplier}`)).body.rows).toHaveLength(0);
    expect((await owner.c.get(`${api}/purchase-items?type=steer`)).body.rows).toEqual([expect.objectContaining({ tag: 'PB-1' })]);
    const lali = items.body.rows.find((r: { tag: string }) => r.tag === 'PB-2').animalKey;
    expect((await owner.c.get(`${api}/purchase-items?animal=${lali}`)).body.rows).toEqual([expect.objectContaining({ tag: 'PB-2' })]);
    expect((await owner.c.get(`${api}/purchase-items?type=nope`)).status).toBe(422);

    // A supplier, broker or batch used by a purchase can't be deleted.
    expect((await owner.c.delete(`${api}/distribution/suppliers/${broker}`)).status).toBe(409);
    expect((await owner.c.delete(`${api}/herd/batches/${batch}`)).status).toBe(409);
  });

  it('validates the header, the lines and ear tags', async () => {
    const { owner, api, post } = await setup();
    await post('/herd', { tag: 'TAKEN', sex: 'female' });

    const empty = await owner.c.post(`${api}/purchases`, { items: [] });
    expect(empty.status).toBe(422);
    expect(Object.keys(empty.body.error.details)).toEqual(expect.arrayContaining(['number', 'purchaseDate', 'sourceType', 'items']));

    const lineErrors = await owner.c.post(`${api}/purchases`, { ...baseBody, items: [{ tag: '', sex: 'cow', price: '' }] });
    expect(Object.keys(lineErrors.body.error.details).sort()).toEqual(['items.0.price', 'items.0.sex', 'items.0.tag']);

    const tags = await owner.c.post(`${api}/purchases`, {
      ...baseBody,
      items: [
        { tag: 'taken', sex: 'male', price: '1' },
        { tag: 'NEW-1', sex: 'male', price: '1' },
        { tag: 'new-1', sex: 'male', price: '1' },
      ],
    });
    expect(tags.body.error.details).toEqual({ 'items.0.tag': ['Ear tag "TAKEN" is already in the herd'], 'items.2.tag': ['Ear tag is used twice in this purchase'] });

    await owner.c.post(`${api}/purchases`, { ...baseBody, items: [{ tag: 'OK-1', sex: 'male', price: '1' }] });
    const dup = await owner.c.post(`${api}/purchases`, { ...baseBody, number: 'po-001', items: [{ tag: 'OK-2', sex: 'male', price: '1' }] });
    expect(dup.body.error.details.number).toEqual(['Purchase no. "po-001" is already used']);
  });

  it('updates lines and animals, adds and removes lines, and deletes with the animals', async () => {
    const { owner, api } = await setup();
    const created = (
      await owner.c.post(`${api}/purchases`, {
        ...baseBody,
        items: [
          { tag: 'U-1', sex: 'male', price: '30000', entryWeightKg: '150' },
          { tag: 'U-2', sex: 'female', price: '10000' },
        ],
      })
    ).body;
    const [one, two] = created.items;

    // Change line 1 (tag, price, weight), drop line 2, add line 3; costs re-split.
    const updated = await owner.c.put(`${api}/purchases/${created.key}`, {
      ...baseBody,
      sourceType: 'farmer',
      otherCost: '0',
      items: [
        { key: one.key, tag: 'U-1A', sex: 'male', price: '34000', entryWeightKg: '160' },
        { tag: 'U-3', sex: 'female', price: '17000' },
      ],
    });
    expect(updated.status).toBe(200);
    // Farmer purchase: no haat name. Shared = 1000 + 500 + 200 = 1700 → 2/3 and 1/3.
    expect(updated.body).toMatchObject({ sourceType: 'farmer', haatName: null, animals: 2, totalPrice: 51000, sharedCost: 1700, totalLanded: 52700 });
    expect(updated.body.items).toEqual([
      expect.objectContaining({ key: one.key, animalKey: one.animalKey, tag: 'U-1A', allocatedSharedCost: 1133.33, landedCost: 35133.33, entryWeightKg: 160 }),
      expect.objectContaining({ tag: 'U-3', allocatedSharedCost: 566.67, landedCost: 17566.67 }),
    ]);
    const herdTags = async () => (await owner.c.get(`${api}/herd`)).body.rows.map((a: { tag: string }) => a.tag).sort();
    expect(await herdTags()).toEqual(['U-1A', 'U-3']);
    expect((await owner.c.get(`${api}/herd/weights`)).body.rows).toEqual([expect.objectContaining({ animalName: 'U-1A', weight: 160, weighType: 'arrival' })]);

    // A line key from another purchase is rejected.
    const stale = await owner.c.put(`${api}/purchases/${created.key}`, { ...baseBody, items: [{ key: two.key, tag: 'X', sex: 'male', price: '1' }] });
    expect(stale.body.error.details['items.0.key']).toEqual(['This line no longer exists']);

    expect((await owner.c.delete(`${api}/purchases/${created.key}`)).status).toBe(204);
    expect((await owner.c.get(`${api}/purchases`)).body.rows).toHaveLength(0);
    expect(await herdTags()).toEqual([]);
    expect((await owner.c.get(`${api}/purchases/${created.key}`)).status).toBe(404);
  });

  it('enforces purchase permissions; accountants manage purchases, workers cannot see them', async () => {
    const { owner, farm, api } = await setup();
    const accountant = await inviteAndJoin(app, owner, farm.slug, 'accountant');
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    const made = await accountant.c.post(`${api}/purchases`, { ...baseBody, items: [{ tag: 'A-1', sex: 'male', price: '5' }] });
    expect(made.status).toBe(201);
    // The purchase form's supplier and batch selects load for an accountant.
    expect((await accountant.c.get(`${api}/herd/batches/options`)).status).toBe(200);
    expect((await worker.c.get(`${api}/purchases`)).status).toBe(403);
    expect((await worker.c.get(`${api}/purchase-items`)).status).toBe(403);
    expect((await accountant.c.get(`${api}/purchase-items`)).status).toBe(200);
    // The list filters' animal select loads for anyone who can list purchases.
    expect((await accountant.c.get(`${api}/herd/options`)).status).toBe(200);
    expect((await worker.c.post(`${api}/purchases`, { ...baseBody, items: [{ tag: 'W-1', sex: 'male', price: '5' }] })).status).toBe(403);
  });
});
