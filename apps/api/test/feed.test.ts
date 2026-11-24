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

/** A farm with a warehouse, an employee and two product sizes. */
async function setup() {
  const owner = await signUp(app);
  const { farm } = await createFarm(owner.c);
  const api = `/api/farms/${farm.slug}`;
  const post = async (path: string, body: object) => {
    const res = await owner.c.post(`${api}${path}`, body);
    expect(res.status).toBe(201);
    return res.body.key as string;
  };
  const warehouse = await post('/herd/warehouses', { name: 'Feed store' });
  const employee = await post('/hr/employees', { code: 'E-1', name: 'Karim' });
  const category = await post('/products/categories', { name: 'Feed', code: 'FEED' });
  const unit = await post('/products/units', { name: 'Kilogram', shortName: 'kg' });
  const product = await post('/products', { name: 'Dairy concentrate', code: 'DC', categoryKey: category, unitKey: unit });
  const bag25 = await post('/products/product-sizes', { productKey: product, unitKey: unit, name: 'Dairy concentrate 25 kg', code: 'DC-25' });
  const bag50 = await post('/products/product-sizes', { productKey: product, name: 'Dairy concentrate 50 kg', code: 'DC-50' });
  return { owner, farm, api, post, warehouse, employee, bag25, bag50 };
}

describe('feed: finish receives', () => {
  it('creates a receive with lines, works out prices and totals, lists and filters', async () => {
    const { owner, api, warehouse, employee, bag25, bag50 } = await setup();
    const res = await owner.c.post(`${api}/feed/finish-receives`, {
      orderNo: 'FR-001',
      receiveDate: '2026-11-20',
      warehouseKey: warehouse,
      receivedByKey: employee,
      note: 'From the mill',
      items: [
        { productSizeKey: bag25, quantity: '40', rate: '1250.5' },
        { productSizeKey: bag50, quantity: '2.5', rate: '2400' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ orderNo: 'FR-001', warehouseName: 'Feed store', receivedByName: 'Karim', note: 'From the mill', status: 0, totalQuantity: 42.5, totalPrice: 56020 });
    expect(res.body.lines).toEqual([
      expect.objectContaining({ productSizeName: 'Dairy concentrate 25 kg', productName: 'Dairy concentrate', unitName: 'Kilogram', quantity: 40, rate: 1250.5, price: 50020, status: 0 }),
      expect.objectContaining({ productSizeName: 'Dairy concentrate 50 kg', quantity: 2.5, rate: 2400, price: 6000 }),
    ]);

    const list = (await owner.c.get(`${api}/feed/finish-receives`)).body;
    expect(list.pagination.total).toBe(1);
    expect(list.rows[0]).toMatchObject({ orderNo: 'FR-001', items: 2, totalPrice: 56020 });
    expect((await owner.c.get(`${api}/feed/finish-receives?status=1`)).body.rows).toHaveLength(0);
    expect((await owner.c.get(`${api}/feed/finish-receives?warehouse=${warehouse}`)).body.rows).toHaveLength(1);
    expect((await owner.c.get(`${api}/feed/finish-receives?q=mill`)).body.rows).toHaveLength(1);
    expect((await owner.c.get(`${api}/feed/finish-receives?from=2026-12-01`)).body.rows).toHaveLength(0);

    // A warehouse, employee or product size used by a receive can't be deleted.
    expect((await owner.c.delete(`${api}/herd/warehouses/${warehouse}`)).status).toBe(409);
    expect((await owner.c.delete(`${api}/hr/employees/${employee}`)).status).toBe(409);
    expect((await owner.c.delete(`${api}/products/product-sizes/${bag50}`)).status).toBe(409);
  });

  it('validates the header and lines', async () => {
    const { owner, api, warehouse, bag25 } = await setup();
    const empty = await owner.c.post(`${api}/feed/finish-receives`, { items: [] });
    expect(Object.keys(empty.body.error.details)).toEqual(expect.arrayContaining(['orderNo', 'receiveDate', 'warehouseKey', 'items']));
    const lines = await owner.c.post(`${api}/feed/finish-receives`, { orderNo: 'X', receiveDate: '2026-11-20', warehouseKey: warehouse, items: [{ productSizeKey: '', quantity: '', rate: '-1' }] });
    expect(Object.keys(lines.body.error.details).sort()).toEqual(['items.0.productSizeKey', 'items.0.quantity', 'items.0.rate']);
    await owner.c.post(`${api}/feed/finish-receives`, { orderNo: 'FR-9', receiveDate: '2026-11-20', warehouseKey: warehouse, items: [{ productSizeKey: bag25, quantity: '1', rate: '1' }] });
    const dup = await owner.c.post(`${api}/feed/finish-receives`, { orderNo: 'fr-9', receiveDate: '2026-11-20', warehouseKey: warehouse, items: [{ productSizeKey: bag25, quantity: '1', rate: '1' }] });
    expect(dup.body.error.details.orderNo).toEqual(['Order no. "fr-9" is already used']);
  });

  it('edits lines while pending, then processes and locks the receive', async () => {
    const { owner, api, warehouse, bag25, bag50 } = await setup();
    const created = (
      await owner.c.post(`${api}/feed/finish-receives`, {
        orderNo: 'FR-100',
        receiveDate: '2026-11-21',
        warehouseKey: warehouse,
        items: [
          { productSizeKey: bag25, quantity: '10', rate: '100' },
          { productSizeKey: bag50, quantity: '5', rate: '200' },
        ],
      })
    ).body;
    const [first] = created.lines;

    // Change line 1, drop line 2, add a new line.
    const updated = await owner.c.put(`${api}/feed/finish-receives/${created.key}`, {
      orderNo: 'FR-100',
      receiveDate: '2026-11-21',
      warehouseKey: warehouse,
      items: [
        { key: first.key, productSizeKey: bag25, quantity: '12', rate: '100' },
        { productSizeKey: bag50, quantity: '1', rate: '250' },
      ],
    });
    expect(updated.status).toBe(200);
    expect(updated.body.lines.map((l: { key: string; price: number }) => [l.key === first.key, l.price])).toEqual([
      [true, 1200],
      [false, 250],
    ]);
    expect(updated.body.totalPrice).toBe(1450);

    // Process: header and lines become 1; changes are refused afterwards.
    const processed = await owner.c.post(`${api}/feed/finish-receives/${created.key}/process`);
    expect(processed.status).toBe(200);
    expect(processed.body.status).toBe(1);
    expect(processed.body.lines.every((l: { status: number }) => l.status === 1)).toBe(true);
    expect((await owner.c.post(`${api}/feed/finish-receives/${created.key}/process`)).body.error.code).toBe('ALREADY_PROCESSED');
    expect((await owner.c.put(`${api}/feed/finish-receives/${created.key}`, { orderNo: 'FR-100', receiveDate: '2026-11-21', warehouseKey: warehouse, items: [{ productSizeKey: bag25, quantity: '1', rate: '1' }] })).status).toBe(409);
    expect((await owner.c.delete(`${api}/feed/finish-receives/${created.key}`)).status).toBe(409);
    expect((await owner.c.get(`${api}/feed/finish-receives?status=1`)).body.rows).toHaveLength(1);
  });

  it('deletes pending receives; workers record receives but cannot process or delete', async () => {
    const { owner, farm, api, warehouse, employee, bag25 } = await setup();
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    const body = { orderNo: 'FR-W', receiveDate: '2026-11-22', warehouseKey: warehouse, receivedByKey: employee, items: [{ productSizeKey: bag25, quantity: '3', rate: '10' }] };
    // The form's warehouse, employee and product selects load for a worker who can create receives.
    expect((await worker.c.get(`${api}/herd/warehouses/options`)).status).toBe(200);
    expect((await worker.c.get(`${api}/hr/employees/options`)).status).toBe(200);
    expect((await worker.c.get(`${api}/products/product-sizes/options`)).status).toBe(200);
    const made = await worker.c.post(`${api}/feed/finish-receives`, body);
    expect(made.status).toBe(201);
    expect((await worker.c.post(`${api}/feed/finish-receives/${made.body.key}/process`)).status).toBe(403);
    expect((await worker.c.delete(`${api}/feed/finish-receives/${made.body.key}`)).status).toBe(403);
    expect((await owner.c.delete(`${api}/feed/finish-receives/${made.body.key}`)).status).toBe(204);
    expect((await owner.c.get(`${api}/feed/finish-receives`)).body.rows).toHaveLength(0);
  });
});
