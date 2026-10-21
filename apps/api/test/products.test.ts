import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { pool } from '../src/db/client';
import { createFarm, inviteAndJoin } from './farm-helpers';
import { signUp } from './helpers';

vi.mock('../src/modules/farms/emails', () =>
  import('./farm-helpers').then((m) => m.farmEmailsMock),
);

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
  const base = `/api/farms/${farm.slug}/products`;
  return { owner, farm, base };
}

/** A farm with a category, brand, unit and size to build products from. */
async function seeded() {
  const ctx = await setup();
  const { owner, base } = ctx;
  const post = async (path: string, body: object) =>
    (await owner.c.post(`${base}${path}`, body)).body.key as string;
  const masters = {
    category: await post('/categories', { name: 'Feed', code: 'FEED' }),
    medicine: await post('/categories', { name: 'Medicine', code: 'MED' }),
    brand: await post('/brands', { name: 'Cargill', code: 'CRG' }),
    kg: await post('/units', { name: 'Kilogram', shortName: 'kg' }),
    bag: await post('/sizes', { name: '25 kg bag', shortName: '25KG', weight: '25' }),
  };
  const product = (name: string, code: string, extra: object = {}) =>
    post('', { name, code, categoryKey: masters.category, unitKey: masters.kg, ...extra });
  return { ...ctx, ...masters, product };
}

const names = (body: { rows: { name: string }[] }) => body.rows.map((r) => r.name);

// Smallest valid PNG (1×1, transparent).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

describe('products catalog', () => {
  it('creates, lists, searches, updates and deletes units', async () => {
    const { owner, base } = await setup();
    const created = await owner.c.post(`${base}/units`, {
      name: 'Kilogram',
      shortName: 'kg',
      description: '',
    });
    expect(created.status).toBe(201);
    await owner.c.post(`${base}/units`, { name: 'Litre', shortName: 'L' });

    const list = await owner.c.get(`${base}/units?pageSize=1`);
    expect(list.body.pagination).toEqual({ page: 1, pageSize: 1, total: 2 });
    // Only the columns the screen uses.
    expect(list.body.rows[0]).toEqual({
      key: created.body.key,
      name: 'Kilogram',
      shortName: 'kg',
      description: null,
    });
    expect(names((await owner.c.get(`${base}/units?q=lit`)).body)).toEqual(['Litre']);

    const updated = await owner.c.put(`${base}/units/${created.body.key}`, {
      name: 'Kilograms',
      shortName: 'kg',
    });
    expect(updated.status).toBe(200);

    expect((await owner.c.delete(`${base}/units/${created.body.key}`)).status).toBe(204);
    expect((await owner.c.get(`${base}/units`)).body.pagination.total).toBe(1);
    expect(
      (await owner.c.put(`${base}/units/${created.body.key}`, { name: 'X', shortName: 'x' }))
        .status,
    ).toBe(404);
    expect((await owner.c.delete(`${base}/units/not-a-uuid`)).status).toBe(404);
  });

  it('rejects duplicates case-insensitively, but allows reusing deleted names', async () => {
    const { owner, base } = await setup();
    const first = await owner.c.post(`${base}/brands`, { name: 'Cargill', code: 'CRG' });
    const dup = await owner.c.post(`${base}/brands`, { name: 'cargill' });
    expect(dup.status).toBe(422);
    expect(dup.body.error.details).toEqual({ name: ['Another brand already uses this name'] });
    const dupCode = await owner.c.post(`${base}/brands`, { name: 'Other', code: 'crg' });
    expect(dupCode.body.error.details).toEqual({ code: ['Another brand already uses this code'] });

    await owner.c.delete(`${base}/brands/${first.body.key}`);
    expect((await owner.c.post(`${base}/brands`, { name: 'Cargill' })).status).toBe(201);
  });

  it('requires a size weight and filters by weight range', async () => {
    const { owner, base } = await setup();
    await owner.c.post(`${base}/sizes`, { name: 'Small', weight: 1.5 });
    await owner.c.post(`${base}/sizes`, { name: 'Bag', weight: '25' });
    expect((await owner.c.post(`${base}/sizes`, { name: 'Loose' })).body.error.details).toEqual({
      weight: ['Weight is required'],
    });
    expect((await owner.c.post(`${base}/sizes`, { name: 'Bad', weight: 'abc' })).status).toBe(422);

    expect(
      (await owner.c.get(`${base}/sizes`)).body.rows.map((r: { weight: number }) => r.weight),
    ).toEqual([25, 1.5]);
    expect(names((await owner.c.get(`${base}/sizes?weightMin=2`)).body)).toEqual(['Bag']);
    expect(names((await owner.c.get(`${base}/sizes?weightMax=2`)).body)).toEqual(['Small']);
  });

  it('creates products with an optional brand and a default product size', async () => {
    const { owner, base, category, brand, kg } = await seeded();

    const bad = await owner.c.post(base, {
      name: 'Pellets',
      code: 'P-1',
      categoryKey: kg,
      unitKey: kg,
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details).toEqual({ categoryKey: ['Choose a category'] });

    const withBrand = await owner.c.post(base, {
      name: 'Pellets',
      code: 'P-1',
      categoryKey: category,
      brandKey: brand,
      unitKey: kg,
    });
    expect(withBrand.status).toBe(201);
    const noBrand = await owner.c.post(base, {
      name: 'Hay',
      code: 'H-1',
      categoryKey: category,
      brandKey: '',
      unitKey: kg,
      status: '0',
    });
    expect(noBrand.status).toBe(201);

    expect((await owner.c.get(base)).body.rows).toEqual([
      {
        key: noBrand.body.key,
        name: 'Hay',
        code: 'H-1',
        status: 0,
        description: null,
        image: null,
        categoryKey: category,
        categoryName: 'Feed',
        brandKey: null,
        brandName: null,
        unitKey: kg,
        unitName: 'kg',
      },
      expect.objectContaining({
        name: 'Pellets',
        status: 1,
        brandKey: brand,
        brandName: 'Cargill',
      }),
    ]);

    // Each product got a default size: no size, the product's name, unit and status.
    const sizes = await owner.c.get(`${base}/product-sizes`);
    expect(sizes.body.rows).toEqual([
      expect.objectContaining({
        name: 'Hay',
        productKey: noBrand.body.key,
        sizeKey: null,
        sizeName: null,
        unitName: 'kg',
        status: 0,
        code: null,
      }),
      expect.objectContaining({
        name: 'Pellets',
        productKey: withBrand.body.key,
        sizeKey: null,
        categoryName: 'Feed',
        status: 1,
      }),
    ]);
  });

  it('toggles status of each selected row and filters by status and references', async () => {
    const { owner, base, category, brand, product } = await seeded();
    const alpha = await product('Alpha', 'C-0', { brandKey: brand });
    const beta = await product('Beta', 'C-1', { status: 0 });
    const gamma = await product('Gamma', 'C-2');

    // Active ones become inactive and inactive ones active — in one call.
    expect((await owner.c.post(`${base}/toggle-status`, { keys: [beta, gamma] })).body).toEqual({
      updated: 2,
    });
    const status = async () =>
      Object.fromEntries(
        (await owner.c.get(base)).body.rows.map((r: { name: string; status: number }) => [
          r.name,
          r.status,
        ]),
      );
    expect(await status()).toEqual({ Alpha: 1, Beta: 1, Gamma: 0 });
    await owner.c.post(`${base}/toggle-status`, { keys: [alpha] });
    expect(await status()).toEqual({ Alpha: 0, Beta: 1, Gamma: 0 });
    // Catalogs without a status column have no toggle.
    expect((await owner.c.post(`${base}/units/toggle-status`, { keys: [alpha] })).status).toBe(404);

    expect(names((await owner.c.get(`${base}?status=0`)).body)).toEqual(['Alpha', 'Gamma']);
    expect(names((await owner.c.get(`${base}?brand=${brand}`)).body)).toEqual(['Alpha']);
    expect(names((await owner.c.get(`${base}?status=1&category=${category}`)).body)).toEqual([
      'Beta',
    ]);
    expect(names((await owner.c.get(`${base}/export?status=0&q=gam`)).body)).toEqual(['Gamma']);

    const today = new Date().toISOString().slice(0, 10);
    expect((await owner.c.get(`${base}?from=${today}`)).body.pagination.total).toBe(3);
    expect((await owner.c.get(`${base}?to=2000-01-01`)).body.pagination.total).toBe(0);
    expect((await owner.c.get(`${base}?brand=nope`)).status).toBe(422);
  });

  it('serves searchable options: active rows by query and filters, any row by key', async () => {
    const { owner, base, kg, medicine, product } = await seeded();
    const pellets = await product('Pellets', 'P-1');
    const inactive = await product('Pea hay', 'P-2', { status: 0 });
    const pills = await product('Pills', 'P-3', { categoryKey: medicine });

    expect((await owner.c.get(`${base}/options?q=p`)).body.options).toEqual([
      { key: pellets, name: 'Pellets' },
      { key: pills, name: 'Pills' },
    ]);
    // The product select of a product size narrowed by category.
    expect((await owner.c.get(`${base}/options?category=${medicine}`)).body.options).toEqual([
      { key: pills, name: 'Pills' },
    ]);
    expect((await owner.c.get(`${base}/options?keys=${inactive}`)).body.options).toEqual([
      { key: inactive, name: 'Pea hay' },
    ]);
    expect((await owner.c.get(`${base}/units/options?q=kilo`)).body.options).toEqual([
      { key: kg, name: 'Kilogram' },
    ]);
  });

  it('manages product sizes, filters them by category and cascades product deletes', async () => {
    const { owner, base, category, medicine, brand, kg, bag, product } = await seeded();
    const pellets = await product('Pellets', 'P-1', { brandKey: brand });
    await product('Pills', 'P-2', { categoryKey: medicine });

    const created = await owner.c.post(`${base}/product-sizes`, {
      categoryKey: category, // only narrows the form's product select
      productKey: pellets,
      sizeKey: bag,
      name: 'Pellets 25 kg',
      code: 'P-1-25',
    });
    expect(created.status).toBe(201);

    const list = await owner.c.get(`${base}/product-sizes?category=${category}`);
    expect(names(list.body)).toEqual(['Pellets', 'Pellets 25 kg']);
    expect(list.body.rows[1]).toEqual({
      key: created.body.key,
      name: 'Pellets 25 kg',
      code: 'P-1-25',
      status: 1,
      categoryKey: category,
      categoryName: 'Feed',
      productKey: pellets,
      productName: 'Pellets',
      sizeKey: bag,
      sizeName: '25 kg bag',
      unitKey: null,
      unitName: null,
    });
    expect(names((await owner.c.get(`${base}/product-sizes?category=${medicine}`)).body)).toEqual([
      'Pills',
    ]);
    const missing = await owner.c.post(`${base}/product-sizes`, { name: 'X' });
    expect(Object.keys(missing.body.error.details)).toEqual(['productKey']);

    for (const [path, key] of [
      ['/sizes', bag],
      ['/categories', category],
      ['/brands', brand],
      ['/units', kg],
    ] as const) {
      const res = await owner.c.delete(`${base}${path}/${key}`);
      expect(res.status, path).toBe(409);
      expect(res.body.error.code).toBe('IN_USE');
    }

    // Deleting a product deletes its sizes too.
    expect((await owner.c.delete(`${base}/${pellets}`)).status).toBe(204);
    expect(names((await owner.c.get(`${base}/product-sizes`)).body)).toEqual(['Pills']);
    expect((await owner.c.delete(`${base}/sizes/${bag}`)).status).toBe(204);
    expect((await owner.c.delete(`${base}/brands/${brand}`)).status).toBe(204);
  });

  it('uploads, serves, replaces and removes product images', async () => {
    const { owner, base, product } = await seeded();
    const key = await product('Pellets', 'P-1');
    const upload = (data: Buffer, type = 'image/png') =>
      owner.c.agent
        .put(`${base}/${key}/image`)
        .set('X-Requested-With', 'test')
        .set('Content-Type', type)
        .send(data);

    const first = await upload(PNG);
    expect(first.status).toBe(200);
    expect(first.body.image).toMatch(/^[0-9a-f]{24}\.png$/);
    expect((await owner.c.get(base)).body.rows[0].image).toBe(first.body.image);

    const served = await owner.c.get(`${base}/${key}/image`);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(Buffer.from(served.body).equals(PNG)).toBe(true);

    // The declared type doesn't matter — the bytes do.
    const fake = await upload(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      'image/svg+xml',
    );
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('INVALID_IMAGE');
    expect((await upload(Buffer.alloc(3 * 1024 * 1024, 0xff))).status).toBe(413);

    const second = await upload(PNG);
    expect(second.body.image).not.toBe(first.body.image);

    // Another tenant can't read it.
    const other = await signUp(app);
    const { farm: otherFarm } = await createFarm(other.c, 'Other Farm');
    expect((await other.c.get(`/api/farms/${otherFarm.slug}/products/${key}/image`)).status).toBe(
      404,
    );

    expect((await owner.c.delete(`${base}/${key}/image`)).status).toBe(204);
    expect((await owner.c.get(base)).body.rows[0].image).toBeNull();
    expect((await owner.c.get(`${base}/${key}/image`)).status).toBe(404);
    // Only catalogs with images have the endpoints.
    expect((await owner.c.get(`${base}/units/${key}/image`)).status).toBe(404);
  });

  it('imports all rows or none, with row-level errors', async () => {
    const { owner, base } = await seeded();

    const bad = await owner.c.post(`${base}/import`, {
      rows: [
        { name: 'A', code: 'A-1', category: 'feed', unit: 'KG' },
        { name: 'B', code: 'a-1', category: 'Medicine', unit: 'Kilogram', status: 'maybe' },
      ],
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details).toEqual({ 'rows.1.status': ['Use Active or Inactive'] });

    const dup = await owner.c.post(`${base}/import`, {
      rows: [
        { name: 'A', code: 'A-1', category: 'feed', unit: 'KG' },
        { name: 'B', code: 'a-1', category: 'Medicine', unit: 'Kilogram' },
      ],
    });
    expect(dup.body.error.details).toEqual({ 'rows.1.code': ['Duplicate of row 1'] });

    const unknown = await owner.c.post(`${base}/import`, {
      rows: [{ name: 'B', code: 'B-1', category: 'Toys', brand: 'Nestle', unit: 'Kilogram' }],
    });
    expect(unknown.body.error.details).toEqual({
      'rows.0.category': ['No category "Toys"'],
      'rows.0.brand': ['No brand "Nestle"'],
    });
    expect((await owner.c.get(base)).body.pagination.total).toBe(0);

    const ok = await owner.c.post(`${base}/import`, {
      rows: [
        {
          name: 'A',
          code: 'A-1',
          category: 'FEED',
          brand: 'crg',
          unit: 'kg',
          status: 'Inactive',
          description: '',
        },
        { name: 'B', code: 'B-1', category: 'Feed', brand: '', unit: 'Kilogram' },
      ],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.imported).toBe(2);
    expect((await owner.c.get(base)).body.rows).toEqual([
      expect.objectContaining({ name: 'A', status: 0, brandName: 'Cargill' }),
      expect.objectContaining({ name: 'B', status: 1, brandName: null }),
    ]);
    // Imported products get their default sizes too.
    expect(names((await owner.c.get(`${base}/product-sizes`)).body)).toEqual(['A', 'B']);

    const again = await owner.c.post(`${base}/import`, {
      rows: [{ name: 'C', code: 'b-1', category: 'Feed', unit: 'kg' }],
    });
    expect(again.body.error.details).toEqual({ 'rows.0.code': ['Already exists'] });

    const sizes = await owner.c.post(`${base}/product-sizes/import`, {
      rows: [
        {
          category: 'ignored',
          product: 'a-1',
          size: '25kg',
          unit: '',
          name: 'A 25 kg',
          code: '',
          status: '1',
        },
      ],
    });
    expect(sizes.status).toBe(201);
    expect((await owner.c.get(`${base}/product-sizes?q=25`)).body.rows[0]).toMatchObject({
      productName: 'A',
      sizeName: '25 kg bag',
    });

    const units = await owner.c.post(`${base}/units/import`, {
      rows: [{ name: 'Litre', short_name: 'L' }],
    });
    expect(units.status).toBe(201);
    expect((await owner.c.get(`${base}/units?q=lit`)).body.rows[0]).toMatchObject({
      name: 'Litre',
      shortName: 'L',
    });
  });

  it('bulk-deletes and exports', async () => {
    const { owner, base } = await setup();
    const keys: string[] = [];
    for (const name of ['Red', 'Green', 'Blue'])
      keys.push((await owner.c.post(`${base}/colors`, { name, code: '#000000' })).body.key);

    expect(names((await owner.c.get(`${base}/colors/export`)).body)).toEqual([
      'Blue',
      'Green',
      'Red',
    ]);
    expect(
      (await owner.c.post(`${base}/colors/bulk-delete`, { keys: keys.slice(0, 2) })).body,
    ).toEqual({ deleted: 2 });
    expect((await owner.c.get(`${base}/colors/options`)).body.options).toEqual([
      { key: keys[2], name: 'Blue' },
    ]);
  });

  it('isolates tenants and enforces per-action product permissions', async () => {
    const { owner, farm, base } = await setup();
    const size = (await owner.c.post(`${base}/sizes`, { name: 'Large', weight: 10 })).body;

    const other = await signUp(app);
    const { farm: otherFarm } = await createFarm(other.c, 'Other Farm');
    const otherBase = `/api/farms/${otherFarm.slug}/products`;
    expect((await other.c.get(`${base}/sizes`)).status).toBe(404);
    expect(
      (await other.c.put(`${otherBase}/sizes/${size.key}`, { name: 'Hijack', weight: 1 })).status,
    ).toBe(404);
    // Another tenant's keys can't be used as filters.
    expect((await other.c.get(`${otherBase}/product-sizes?size=${size.key}`)).body.rows).toEqual(
      [],
    );

    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    expect((await worker.c.get(`${base}/sizes`)).status).toBe(200);
    const denied = await worker.c.post(`${base}/sizes`, { name: 'Small', weight: 1 });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FARM_PERMISSION_REQUIRED');
  });
});
