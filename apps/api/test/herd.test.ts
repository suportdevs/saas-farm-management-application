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
  const base = `/api/farms/${farm.slug}/herd`;
  const post = async (path: string, body: object) => {
    const res = await owner.c.post(`${base}${path}`, body);
    expect(res.status).toBe(201);
    return res.body.key as string;
  };
  return { owner, farm, base, post };
}

const tags = (body: { rows: { tag: string }[] }) => body.rows.map((r) => r.tag);

describe('herd: pens', () => {
  it('creates, lists, updates and deletes pens; blocks deleting a pen with animals', async () => {
    const { owner, base, post } = await setup();
    const feedlot = await post('/pen-types', { name: 'Feedlot' });
    const barn = await post('/pens', { name: 'Barn A', code: 'BA', typeKey: feedlot, capacity: '60' });
    await post('/pens', { name: 'Calf pen' });

    const list = await owner.c.get(`${base}/pens`);
    expect(list.status).toBe(200);
    expect(list.body.rows.map((r: { name: string }) => r.name)).toEqual(['Barn A', 'Calf pen']);
    expect(list.body.rows[0]).toMatchObject({ code: 'BA', typeKey: feedlot, typeName: 'Feedlot', capacity: 60, status: 1 });
    expect(list.body.rows[1]).toMatchObject({ typeKey: null, typeName: null });

    expect((await owner.c.get(`${base}/pens?type=${feedlot}`)).body.rows).toHaveLength(1);
    const dup = await owner.c.post(`${base}/pens`, { name: 'barn a' });
    expect(dup.status).toBe(422);
    expect(dup.body.error.details.name).toBeDefined();
    expect((await owner.c.post(`${base}/pens`, { name: 'Odd', capacity: '2.5' })).status).toBe(422);

    expect((await owner.c.put(`${base}/pens/${barn}`, { name: 'Barn A', code: 'BA', capacity: 80 })).status).toBe(200);

    await post('', { tag: 'BD-1', sex: 'female', penKey: barn });
    const blocked = await owner.c.delete(`${base}/pens/${barn}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('IN_USE');
  });
});

describe('herd: pen types', () => {
  it('manages pen types, links pens to them and imports pens by type name', async () => {
    const { owner, farm, base, post } = await setup();
    const quarantine = await post('/pen-types', { name: 'Quarantine', description: 'New arrivals' });
    await post('/pen-types', { name: 'Hospital' });

    const list = await owner.c.get(`${base}/pen-types`);
    expect(list.body.rows.map((r: { name: string }) => r.name)).toEqual(['Hospital', 'Quarantine']);
    expect(list.body.rows[1]).toMatchObject({ key: quarantine, description: 'New arrivals' });
    // Type names are unique per farm (any case).
    const dup = await owner.c.post(`${base}/pen-types`, { name: 'quarantine' });
    expect(dup.body.error.details.name).toBeDefined();
    expect((await owner.c.post(`${base}/pen-types`, { name: '' })).status).toBe(422);
    // Another farm can use the same name.
    const other = await signUp(app);
    const { farm: otherFarm } = await createFarm(other.c);
    expect((await other.c.post(`/api/farms/${otherFarm.slug}/herd/pen-types`, { name: 'Quarantine' })).status).toBe(201);
    expect((await other.c.get(`/api/farms/${otherFarm.slug}/herd/pen-types`)).body.rows).toHaveLength(1);

    // Pens import the type by name; an unknown name is reported.
    const imported = await owner.c.post(`${base}/pens/import`, { rows: [{ name: 'Q1', type: 'quarantine' }] });
    expect(imported.status).toBe(201);
    expect((await owner.c.get(`${base}/pens`)).body.rows[0]).toMatchObject({ name: 'Q1', typeName: 'Quarantine' });
    const unknown = await owner.c.post(`${base}/pens/import`, { rows: [{ name: 'Q2', type: 'Feedlot' }] });
    expect(unknown.body.error.details['rows.0.type']).toEqual(['No pen type "Feedlot"']);
    // Another farm's pen type can't be used.
    const foreign = (await other.c.get(`/api/farms/${otherFarm.slug}/herd/pen-types`)).body.rows[0].key;
    expect((await owner.c.post(`${base}/pens`, { name: 'Q3', typeKey: foreign })).body.error.details.typeKey).toEqual(['Choose a pen type']);

    // A type in use can't be deleted; renaming shows on its pens.
    expect((await owner.c.delete(`${base}/pen-types/${quarantine}`)).body.error.message).toMatch(/1 pen uses this pen type/);
    expect((await owner.c.put(`${base}/pen-types/${quarantine}`, { name: 'Isolation' })).status).toBe(200);
    expect((await owner.c.get(`${base}/pens`)).body.rows[0].typeName).toBe('Isolation');

    // Workers see pen types but can't change them.
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    expect((await worker.c.get(`${base}/pen-types`)).status).toBe(200);
    expect((await worker.c.post(`${base}/pen-types`, { name: 'Sorting' })).status).toBe(403);
  });
});

describe('herd: animals', () => {
  it('registers animals with pen and parents, filters, searches and updates them', async () => {
    const { owner, farm, base, post } = await setup();
    const barn = await post('/pens', { name: 'Barn A', code: 'BA' });
    const mom = await post('', { tag: 'BD-0890', name: 'Daisy', sex: 'female', type: 'cow', breed: 'Holstein' });
    const sire = await post('', { tag: 'BL-7', sex: 'male', type: 'bull' });
    const calf = await post('', {
      tag: 'BD-1024',
      name: 'Bella',
      sex: 'female',
      type: 'calf',
      penKey: barn,
      birthDate: '2024-03-14',
      motherKey: mom,
      fatherKey: sire,
      weight: '85.5',
    });

    const list = await owner.c.get(base);
    expect(tags(list.body)).toEqual(['BD-0890', 'BD-1024', 'BL-7']);
    expect(list.body.rows[1]).toMatchObject({
      key: calf,
      penName: 'Barn A',
      motherName: 'BD-0890',
      fatherName: 'BL-7',
      birthDate: '2024-03-14',
      weight: 85.5,
      origin: 'born',
      herdStatus: 'in_herd',
    });

    expect(tags((await owner.c.get(`${base}?sex=male`)).body)).toEqual(['BL-7']);
    expect(tags((await owner.c.get(`${base}?pen=${barn}`)).body)).toEqual(['BD-1024']);
    expect(tags((await owner.c.get(`${base}?q=holstein`)).body)).toEqual(['BD-0890']);
    expect((await owner.c.get(`${base}?sex=other`)).status).toBe(422);

    // The mother select lists females only, as "tag · name".
    const options = await owner.c.get(`${base}/options?sex=female`);
    expect(options.body.options.map((o: { name: string }) => o.name)).toEqual(['BD-0890 · Daisy', 'BD-1024 · Bella']);

    // Sold animals leave the plan's animal count.
    expect((await owner.c.get(`/api/farms/${farm.slug}`)).body.usage.animals).toBe(3);
    const sold = await owner.c.put(`${base}/${sire}`, { tag: 'BL-7', sex: 'male', herdStatus: 'sold' });
    expect(sold.status).toBe(200);
    expect((await owner.c.get(`/api/farms/${farm.slug}`)).body.usage.animals).toBe(2);
    expect(tags((await owner.c.get(`${base}?herd_status=sold`)).body)).toEqual(['BL-7']);

    // Validation: tag is unique, sex is required, references must exist.
    expect((await owner.c.post(base, { tag: 'bd-1024', sex: 'female' })).body.error.details.tag).toBeDefined();
    expect((await owner.c.post(base, { tag: 'X-1' })).body.error.details.sex).toBeDefined();
    const badRef = await owner.c.post(base, { tag: 'X-2', sex: 'male', penKey: '00000000-0000-4000-8000-000000000000' });
    expect(badRef.body.error.details.penKey).toEqual(['Choose a pen']);

    // A mother with offspring can't be deleted; the calf can.
    expect((await owner.c.delete(`${base}/${mom}`)).body.error.code).toBe('IN_USE');
    expect((await owner.c.delete(`${base}/${calf}`)).status).toBe(204);
    expect((await owner.c.delete(`${base}/${mom}`)).status).toBe(204);
  });

  it('imports animals by ear tag, pen code and choice labels — all rows or none', async () => {
    const { owner, base, post } = await setup();
    await post('/pens', { name: 'Barn A', code: 'BA' });
    await post('', { tag: 'BD-0890', sex: 'female' });

    const bad = await owner.c.post(`${base}/import`, {
      rows: [
        { tag: 'BD-2001', sex: 'Female', pen: 'BA', mother: 'BD-0890' },
        { tag: 'BD-2002', sex: 'Unknown', pen: 'Nowhere' },
      ],
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details['rows.1.sex']).toBeDefined();
    expect((await owner.c.get(base)).body.rows).toHaveLength(1);

    const ok = await owner.c.post(`${base}/import`, {
      rows: [
        { tag: 'BD-2001', sex: 'Female', origin: 'Purchased', purchase_date: '2025-01-10', pen: 'BA', mother: 'BD-0890', herd_status: 'In herd' },
        { tag: 'BD-2002', sex: 'male', type: 'Steer', birth_date: '' },
      ],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.imported).toBe(2);
    const rows = (await owner.c.get(`${base}/export`)).body.rows;
    expect(rows.find((r: { tag: string }) => r.tag === 'BD-2001')).toMatchObject({ origin: 'purchased', penName: 'Barn A', motherName: 'BD-0890' });
    expect(rows.find((r: { tag: string }) => r.tag === 'BD-2002')).toMatchObject({ sex: 'male', type: 'steer', birthDate: null });
  });

  it('enforces per-operation herd permissions', async () => {
    const { owner, farm, base, post } = await setup();
    const barn = await post('/pens', { name: 'Barn A' });
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    const viewer = await inviteAndJoin(app, owner, farm.slug, 'viewer');

    // Workers add and edit animals but don't delete them or manage pens.
    const created = await worker.c.post(base, { tag: 'W-1', sex: 'female', penKey: barn });
    expect(created.status).toBe(201);
    expect((await worker.c.put(`${base}/${created.body.key}`, { tag: 'W-1', sex: 'female', name: 'Rosie' })).status).toBe(200);
    expect((await worker.c.delete(`${base}/${created.body.key}`)).status).toBe(403);
    expect((await worker.c.get(`${base}/pens`)).status).toBe(200);
    expect((await worker.c.post(`${base}/pens`, { name: 'Barn B' })).status).toBe(403);
    // The animal form's pen select works without listing rights on another operation.
    expect((await worker.c.get(`${base}/pens/options`)).status).toBe(200);

    // Viewers only look.
    expect((await viewer.c.get(base)).status).toBe(200);
    expect((await viewer.c.post(base, { tag: 'V-1', sex: 'male' })).status).toBe(403);

    // A custom role with only pen keys can't see animals.
    const role = await owner.c.post(`/api/farms/${farm.slug}/roles`, { name: 'Pen keeper', permissions: ['herd.pen_list', 'herd.pen_create'] });
    expect(role.status).toBe(201);
    const keeper = await inviteAndJoin(app, owner, farm.slug, 'viewer');
    const assigned = await owner.c.patch(`/api/farms/${farm.slug}/members/${keeper.id}`, { customRoleId: role.body.role.id });
    expect(assigned.status).toBeLessThan(300);
    expect((await keeper.c.post(`${base}/pens`, { name: 'Barn C' })).status).toBe(201);
    expect((await keeper.c.get(base)).status).toBe(403);
  });
});

describe('herd: batches', () => {
  it('manages batches with supplier, dates, targets and money; counts their animals', async () => {
    const { owner, farm, base, post } = await setup();
    const barn = await post('/pens', { name: 'Barn A', code: 'BA' });
    const supplier = (await owner.c.post(`/api/farms/${farm.slug}/distribution/suppliers`, { name: 'Hat Traders', code: 'SUP-1' })).body.key;
    const calves = await post('/batches', {
      number: 'CALF-25',
      name: 'Calves 2025',
      arrivalDate: '2025-01-01',
      expectedExitDate: '2025-07-01',
      supplierKey: supplier,
      targetWeight: '450',
      totalPurchaseCost: '250000.50',
      purpose: 'Calves',
      penKey: barn,
    });
    await post('/batches', { number: 'DRY-24', arrivalDate: '2024-06-01', status: 'Completed', targetWeightUnit: 'lb' });

    const list = await owner.c.get(`${base}/batches`);
    // Newest arrival first.
    expect(list.body.rows.map((r: { number: string }) => r.number)).toEqual(['CALF-25', 'DRY-24']);
    expect(list.body.rows[0]).toMatchObject({
      name: 'Calves 2025',
      arrivalDate: '2025-01-01',
      expectedExitDate: '2025-07-01',
      actualExitDate: null,
      supplierKey: supplier,
      supplierName: 'Hat Traders',
      status: 'active',
      targetWeight: 450,
      targetWeightUnit: 'kg',
      totalPurchaseCost: 250000.5,
      totalSaleRevenue: 0,
      purpose: 'calves',
      penName: 'Barn A',
      totalAnimals: 0,
      activeAnimals: 0,
    });
    expect(list.body.rows[1]).toMatchObject({ name: null, status: 'completed', targetWeightUnit: 'lb', supplierName: null });

    // Filters: arrival range, status, supplier.
    expect((await owner.c.get(`${base}/batches?arrival_dateFrom=2025-01-01`)).body.rows).toHaveLength(1);
    expect((await owner.c.get(`${base}/batches?arrival_dateTo=2024-12-31`)).body.rows[0].number).toBe('DRY-24');
    expect((await owner.c.get(`${base}/batches?status=completed`)).body.rows[0].number).toBe('DRY-24');
    expect((await owner.c.get(`${base}/batches?supplier=${supplier}`)).body.rows[0].number).toBe('CALF-25');

    // Validation: batch number unique and required, arrival date required, status from the list.
    expect((await owner.c.post(`${base}/batches`, { number: 'calf-25', arrivalDate: '2025-02-01' })).body.error.details.number).toBeDefined();
    const bad = await owner.c.post(`${base}/batches`, { status: 'sold' });
    expect(Object.keys(bad.body.error.details).sort()).toEqual(['arrivalDate', 'number', 'status']);

    // The pen and the supplier now hold a batch: neither can be deleted.
    expect((await owner.c.delete(`${base}/pens/${barn}`)).body.error.message).toMatch(/1 batch uses/);
    expect((await owner.c.delete(`/api/farms/${farm.slug}/distribution/suppliers/${supplier}`)).body.error.message).toMatch(/1 batch uses this supplier/);

    const calf = await post('', { tag: 'C-1', sex: 'female', batchKey: calves });
    await post('', { tag: 'C-0', sex: 'male', batchKey: calves, herdStatus: 'sold' });
    expect((await owner.c.get(`${base}/batches`)).body.rows[0]).toMatchObject({ totalAnimals: 2, activeAnimals: 1 });
    expect((await owner.c.get(`${base}?batch=${calves}`)).body.rows.map((r: { tag: string }) => r.tag)).toEqual(['C-0', 'C-1']);
    expect((await owner.c.get(`${base}?q=C-1`)).body.rows[0]).toMatchObject({ batchKey: calves, batchName: 'CALF-25' });
    expect((await owner.c.delete(`${base}/batches/${calves}`)).body.error.code).toBe('IN_USE');

    // Batch selects show "number · name".
    expect((await owner.c.get(`${base}/batches/options?q=calf`)).body.options[0].name).toBe('CALF-25 · Calves 2025');

    // Batch imports match the supplier by code; animal imports match the batch by number.
    const batchImport = await owner.c.post(`${base}/batches/import`, { rows: [{ batch_number: 'B-3', arrival_date: '2025-03-01', supplier: 'sup-1', status: 'Active' }] });
    expect(batchImport.status).toBe(201);
    expect((await owner.c.get(`${base}/batches?supplier=${supplier}`)).body.rows).toHaveLength(2);
    const imported = await owner.c.post(`${base}/import`, { rows: [{ tag: 'C-2', sex: 'male', batch: 'CALF-25' }] });
    expect(imported.status).toBe(201);
    expect((await owner.c.get(`${base}?batch=${calves}`)).body.rows).toHaveLength(3);

    await owner.c.put(`${base}/${calf}`, { tag: 'C-1', sex: 'female', batchKey: '' });
    expect((await owner.c.get(`${base}?batch=${calves}`)).body.rows).toHaveLength(2);
  });
});

describe('herd: weight records', () => {
  it('records weighings, works out gain / days / ADG, keeps the animal on its latest weight, filters and imports', async () => {
    const { owner, base, post } = await setup();
    const spring = await post('/batches', { number: 'B-W1', arrivalDate: '2025-01-01' });
    const bella = await post('', { tag: 'BD-1', sex: 'female', batchKey: spring });
    const max = await post('', { tag: 'BD-2', sex: 'male', weight: '400' });
    const weightOf = async (key: string) => (await owner.c.get(base)).body.rows.find((r: { key: string }) => r.key === key).weight;
    const rows = async (q = '') => (await owner.c.get(`${base}/weights${q}`)).body.rows;

    const first = await post('/weights', { animalKey: bella, weighDate: '2025-01-10', weight: '210', weighType: 'Arrival', weighMethod: 'Digital scale' });
    const second = await post('/weights', { animalKey: bella, weighDate: '2025-03-11', weight: '255.5', bodyConditionScore: '3.5', hipHeight: '118', scaleId: 'SC-1' });
    // An older weighing entered later doesn't replace the latest one.
    await post('/weights', { animalKey: bella, weighDate: '2024-12-01', weight: '190', weighMethod: 'tape_measure' });
    expect(await weightOf(bella)).toBe(255.5);
    expect(await weightOf(max)).toBe(400);

    const list = await rows();
    expect(list.map((r: { weighDate: string }) => r.weighDate)).toEqual(['2025-03-11', '2025-01-10', '2024-12-01']);
    // Worked out from the previous weighing of the same animal; batch defaults to the animal's.
    expect(list[2]).toMatchObject({ previousWeight: null, weightGain: null, daysSinceLast: null, adg: null });
    expect(list[1]).toMatchObject({ key: first, animalName: 'BD-1', weight: 210, weightUnit: 'kg', weighType: 'arrival', weighMethod: 'digital_scale', previousWeight: 190, weightGain: 20, daysSinceLast: 40, adg: 0.5, batchName: 'B-W1' });
    expect(list[0]).toMatchObject({ key: second, weighType: 'routine', previousWeight: 210, weightGain: 45.5, daysSinceLast: 60, adg: 0.758, bodyConditionScore: 3.5, hipHeight: 118, scaleId: 'SC-1' });
    expect(list[0].recordedByName).toBeTruthy();

    expect(await rows('?weigh_dateFrom=2025-01-01&weigh_dateTo=2025-02-28')).toHaveLength(1);
    expect(await rows(`?animal=${max}`)).toHaveLength(0);
    expect(await rows('?weightMin=200')).toHaveLength(2);
    expect(await rows('?weigh_type=arrival')).toHaveLength(1);
    expect(await rows(`?batch=${spring}`)).toHaveLength(3);

    // Editing or deleting a weighing recalculates the next one and the animal's weight.
    await owner.c.put(`${base}/weights/${first}`, { animalKey: bella, weighDate: '2025-01-10', weight: '220' });
    expect((await rows()).find((r: { key: string }) => r.key === second)).toMatchObject({ previousWeight: 220, weightGain: 35.5 });
    expect((await owner.c.delete(`${base}/weights/${second}`)).status).toBe(204);
    expect(await weightOf(bella)).toBe(220);

    // Validation: animal, date and weight are required.
    const bad = await owner.c.post(`${base}/weights`, { weight: '' });
    expect(Object.keys(bad.body.error.details).sort()).toEqual(['animalKey', 'weighDate', 'weight']);

    // Imports match the animal by ear tag.
    const imported = await owner.c.post(`${base}/weights/import`, {
      rows: [
        { animal: 'BD-2', weigh_date: '2025-05-01', weight: '420', weigh_method: 'Digital scale', weigh_type: 'Pre-sale' },
        { animal: 'bd-1', weigh_date: '2025-05-01', weight: '270' },
      ],
    });
    expect(imported.status).toBe(201);
    expect(await weightOf(max)).toBe(420);
    expect(await weightOf(bella)).toBe(270);
    const unknown = await owner.c.post(`${base}/weights/import`, { rows: [{ animal: 'NOPE', weigh_date: '2025-05-01', weight: '1' }] });
    expect(unknown.body.error.details['rows.0.animal']).toEqual(['No animal "NOPE"']);

    // A batch with weight records can't be deleted; deleting an animal takes its records with it.
    expect((await owner.c.delete(`${base}/batches/${spring}`)).status).toBe(409);
    expect((await owner.c.delete(`${base}/${max}`)).status).toBe(204);
    expect((await rows()).every((r: { animalName: string }) => r.animalName === 'BD-1')).toBe(true);
  });

  it('lets workers record weights but not delete them', async () => {
    const { owner, farm, base, post } = await setup();
    const cow = await post('', { tag: 'W-1', sex: 'female' });
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    const rec = await worker.c.post(`${base}/weights`, { animalKey: cow, weighDate: '2025-02-02', weight: '300' });
    expect(rec.status).toBe(201);
    expect((await worker.c.delete(`${base}/weights/${rec.body.key}`)).status).toBe(403);
    expect((await worker.c.post(`${base}/batches`, { name: 'Mine' })).status).toBe(403);
    expect((await worker.c.get(`${base}/batches`)).status).toBe(200);
    expect((await worker.c.post(`${base}/weight-targets`, { animalKey: cow, targetWeight: '400', targetDate: '2030-01-01' })).status).toBe(403);
  });
});

describe('herd: weight targets', () => {
  it('tracks progress and status for animals and batches', async () => {
    const { owner, base, post } = await setup();
    const batch = await post('/batches', { number: 'B-T1', arrivalDate: '2025-01-01' });
    const cow = await post('', { tag: 'T-1', sex: 'female', batchKey: batch });
    await post('', { tag: 'T-2', sex: 'female', batchKey: batch, weight: '300' });
    await post('/weights', { animalKey: cow, weighDate: '2025-02-01', weight: '200' });
    const targets = async (q = '') => (await owner.c.get(`${base}/weight-targets${q}`)).body.rows;
    const find = async (key: string) => (await targets()).find((r: { key: string }) => r.key === key);

    const forCow = await post('/weight-targets', { animalKey: cow, targetWeight: '400', targetDate: '2099-12-31', targetAdg: '1.2' });
    expect(await find(forCow)).toMatchObject({ animalName: 'T-1', batchName: null, targetWeight: 400, targetAdg: 1.2, currentProgress: 50, status: 'active' });

    // A batch target uses the average weight of its animals in the herd: (200 + 300) / 2 = 250.
    const forBatch = await post('/weight-targets', { batchKey: batch, targetWeight: '250', targetDate: '2099-12-31' });
    expect(await find(forBatch)).toMatchObject({ batchName: 'B-T1', currentProgress: 100, status: 'achieved' });

    // A new weighing moves the progress.
    await post('/weights', { animalKey: cow, weighDate: '2025-03-01', weight: '420' });
    expect(await find(forCow)).toMatchObject({ currentProgress: 105, status: 'achieved' });

    // A past target date not reached is missed.
    const late = await post('/weight-targets', { animalKey: cow, targetWeight: '900', targetDate: '2020-01-01' });
    expect(await find(late)).toMatchObject({ status: 'missed' });
    expect(await targets('?status=missed')).toHaveLength(1);
    expect(await targets(`?batch=${batch}`)).toHaveLength(1);

    // An animal or a batch is required; target weight and date too.
    const bad = await owner.c.post(`${base}/weight-targets`, { targetWeight: '100', targetDate: '2030-01-01' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details.animalKey).toEqual(['Choose an animal or a batch']);
    const missing = await owner.c.post(`${base}/weight-targets`, { animalKey: cow });
    expect(Object.keys(missing.body.error.details).sort()).toEqual(['targetDate', 'targetWeight']);

    // Deleting the animal takes its targets with it.
    expect((await owner.c.delete(`${base}/${cow}`)).status).toBe(204);
    expect(await targets()).toHaveLength(1);
  });
});

describe('herd: movements', () => {
  it('moves animals between pens, keeps each animal in its latest pen and fills the from-pen', async () => {
    const { owner, base, post } = await setup();
    const barnA = await post('/pens', { name: 'Barn A', code: 'BA' });
    const barnB = await post('/pens', { name: 'Barn B', code: 'BB' });
    const sick = await post('/pens', { name: 'Hospital', code: 'HO' });
    const bella = await post('', { tag: 'MV-1', sex: 'female', penKey: barnA });
    const penOf = async (key: string) => (await owner.c.get(base)).body.rows.find((r: { key: string }) => r.key === key).penName;

    // "From pen" left empty = the pen the animal was in.
    const first = await post('/movements', { animalKey: bella, movementDate: '2025-03-01', toPenKey: barnB, reason: 'Sorting' });
    expect(await penOf(bella)).toBe('Barn B');
    const list = await owner.c.get(`${base}/movements`);
    expect(list.body.rows[0]).toMatchObject({ key: first, animalName: 'MV-1', fromPenName: 'Barn A', toPenName: 'Barn B', reason: 'sorting' });
    // "Moved by" is whoever recorded it (created_by).
    expect(list.body.rows[0].movedByName).toBeTruthy();

    const second = await post('/movements', { animalKey: bella, movementDate: '2025-04-01', toPenKey: sick, reason: 'treatment' });
    // An older movement entered later doesn't change the current pen.
    await post('/movements', { animalKey: bella, movementDate: '2025-01-01', fromPenKey: barnB, toPenKey: barnA });
    expect(await penOf(bella)).toBe('Hospital');
    expect((await owner.c.get(`${base}/movements`)).body.rows.find((r: { key: string }) => r.key === second).fromPenName).toBe('Barn B');

    // Filters by pen and date.
    expect((await owner.c.get(`${base}/movements?to_pen=${sick}`)).body.rows).toHaveLength(1);
    expect((await owner.c.get(`${base}/movements?movement_dateFrom=2025-02-01`)).body.rows).toHaveLength(2);

    // Deleting the latest movement moves the animal back.
    expect((await owner.c.delete(`${base}/movements/${second}`)).status).toBe(204);
    expect(await penOf(bella)).toBe('Barn B');

    // Validation: animal, date and destination pen are required.
    const bad = await owner.c.post(`${base}/movements`, {});
    expect(Object.keys(bad.body.error.details).sort()).toEqual(['animalKey', 'movementDate', 'toPenKey']);

    // Imports match the animal by ear tag and pens by code.
    const imported = await owner.c.post(`${base}/movements/import`, { rows: [{ animal: 'mv-1', movement_date: '2025-06-01', to_pen: 'HO', reason: 'Sale prep' }] });
    expect(imported.status).toBe(201);
    expect(await penOf(bella)).toBe('Hospital');

    // A pen with movement history can't be deleted; deleting the animal takes its movements with it.
    expect((await owner.c.delete(`${base}/pens/${barnA}`)).status).toBe(409);
    expect((await owner.c.delete(`${base}/${bella}`)).status).toBe(204);
    expect((await owner.c.get(`${base}/movements`)).body.rows).toHaveLength(0);
  });

  it('lets workers record movements but not delete them', async () => {
    const { owner, farm, base, post } = await setup();
    const pen = await post('/pens', { name: 'Barn' });
    const cow = await post('', { tag: 'MW-1', sex: 'female' });
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    const rec = await worker.c.post(`${base}/movements`, { animalKey: cow, movementDate: '2025-02-02', toPenKey: pen });
    expect(rec.status).toBe(201);
    expect((await worker.c.delete(`${base}/movements/${rec.body.key}`)).status).toBe(403);
    expect((await worker.c.post(`${base}/status-history`, { animalKey: cow, changeDate: '2025-02-02', newStatus: 'sold' })).status).toBe(403);
  });
});

describe('herd: status history', () => {
  it('records status changes, keeps the animal on its latest status and fills the previous status', async () => {
    const { owner, base, post } = await setup();
    const cow = await post('', { tag: 'ST-1', sex: 'female' });
    const statusOf = async (key: string) => (await owner.c.get(base)).body.rows.find((r: { key: string }) => r.key === key).herdStatus;

    const sold = await post('/status-history', { animalKey: cow, changeDate: '2025-05-01', newStatus: 'Sold', reason: 'Market day' });
    expect(await statusOf(cow)).toBe('sold');
    const row = (await owner.c.get(`${base}/status-history`)).body.rows[0];
    expect(row).toMatchObject({ key: sold, animalName: 'ST-1', previousStatus: 'in_herd', newStatus: 'sold', reason: 'Market day' });
    expect(row.changedByName).toBeTruthy();

    // Back in the herd, then deleting that change restores "sold".
    const back = await post('/status-history', { animalKey: cow, changeDate: '2025-06-01', newStatus: 'in_herd' });
    expect(await statusOf(cow)).toBe('in_herd');
    expect((await owner.c.get(`${base}/status-history?new_status=in_herd`)).body.rows[0].previousStatus).toBe('sold');
    expect((await owner.c.delete(`${base}/status-history/${back}`)).status).toBe(204);
    expect(await statusOf(cow)).toBe('sold');

    const bad = await owner.c.post(`${base}/status-history`, { newStatus: 'lost' });
    expect(Object.keys(bad.body.error.details).sort()).toEqual(['animalKey', 'changeDate', 'newStatus']);

    const imported = await owner.c.post(`${base}/status-history/import`, { rows: [{ animal: 'ST-1', change_date: '2025-07-01', new_status: 'Dead', reason: 'Illness' }] });
    expect(imported.status).toBe(201);
    expect(await statusOf(cow)).toBe('dead');
  });
});

describe('herd: breeds', () => {
  it('lists built-in breeds next to the farm’s own; built-in ones are read-only', async () => {
    const { owner, farm, base, post } = await setup();
    const all = (await owner.c.get(`${base}/breeds?pageSize=100`)).body;
    const holstein = all.rows.find((r: { name: string }) => r.name === 'Holstein Friesian');
    expect(holstein).toMatchObject({ code: 'HF', type: 'dairy', originCountry: 'Netherlands', avgMatureWeight: 680, isSystem: true });

    const own = await post('/breeds', { name: 'Local Cross', code: 'LX', type: 'Dual-purpose', originCountry: 'Bangladesh', avgMatureWeight: '320' });
    const list = (await owner.c.get(`${base}/breeds?pageSize=100`)).body.rows;
    expect(list.find((r: { key: string }) => r.key === own)).toMatchObject({ type: 'dual_purpose', avgMatureWeight: 320, isSystem: false });
    expect((await owner.c.get(`${base}/breeds?breed_type=beef`)).body.rows.every((r: { type: string }) => r.type === 'beef')).toBe(true);
    expect((await owner.c.get(`${base}/breeds?q=bangladesh`)).body.rows.map((r: { name: string }) => r.name).sort()).toEqual(['Local Cross', 'Red Chittagong']);

    // Built-in breeds can't be edited or deleted; the farm's own can.
    const edit = await owner.c.put(`${base}/breeds/${holstein.key}`, { name: 'Holstein' });
    expect(edit.status).toBe(403);
    expect(edit.body.error.code).toBe('SYSTEM_ROW');
    expect((await owner.c.delete(`${base}/breeds/${holstein.key}`)).status).toBe(403);
    expect((await owner.c.post(`${base}/breeds/bulk-delete`, { keys: [holstein.key] })).status).toBe(403);
    expect((await owner.c.put(`${base}/breeds/${own}`, { name: 'Local Cross', avgMatureWeight: 330 })).status).toBe(200);
    expect((await owner.c.post(`${base}/breeds`, { name: 'local cross' })).body.error.details.name).toBeDefined();

    // Another farm sees the built-in breeds but not this farm's own.
    const other = await signUp(app);
    const { farm: otherFarm } = await createFarm(other.c);
    const theirs = (await other.c.get(`/api/farms/${otherFarm.slug}/herd/breeds?pageSize=100`)).body.rows;
    expect(theirs.some((r: { name: string }) => r.name === 'Jersey')).toBe(true);
    expect(theirs.some((r: { name: string }) => r.name === 'Local Cross')).toBe(false);
    expect((await other.c.delete(`/api/farms/${otherFarm.slug}/herd/breeds/${own}`)).status).toBe(404);

    // Selects offer built-in breeds too.
    const options = (await owner.c.get(`${base}/breeds/options?q=jers`)).body.options;
    expect(options.map((o: { name: string }) => o.name)).toEqual(['Jersey']);

    expect((await owner.c.delete(`${base}/breeds/${own}`)).status).toBe(204);
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    expect((await worker.c.get(`${base}/breeds`)).status).toBe(200);
    expect((await worker.c.post(`${base}/breeds`, { name: 'Mine' })).status).toBe(403);
  });
});

describe('herd: warehouses', () => {
  it('creates, lists, searches, updates, imports and deletes warehouses', async () => {
    const { owner, base, post } = await setup();
    const feed = await post('/warehouses', { name: 'Feed store', description: 'North yard' });
    await post('/warehouses', { name: 'Medicine store' });
    const names = async (q = '') => (await owner.c.get(`${base}/warehouses${q}`)).body.rows.map((r: { name: string }) => r.name);
    expect(await names()).toEqual(['Feed store', 'Medicine store']);
    // Names are unique per farm (any case) and required.
    expect((await owner.c.post(`${base}/warehouses`, { name: 'feed STORE' })).body.error.details.name).toBeDefined();
    expect((await owner.c.post(`${base}/warehouses`, { description: 'x' })).body.error.details.name).toEqual(['Name is required']);
    expect((await owner.c.put(`${base}/warehouses/${feed}`, { name: 'Feed & silage store', description: '' })).status).toBe(200);
    const imported = await owner.c.post(`${base}/warehouses/import`, { rows: [{ name: 'Equipment shed', description: 'Tractors' }] });
    expect(imported.body.imported).toBe(1);
    expect(await names('?q=store')).toEqual(['Feed & silage store', 'Medicine store']);
    expect((await owner.c.delete(`${base}/warehouses/${feed}`)).status).toBe(204);
    expect(await names()).toEqual(['Equipment shed', 'Medicine store']);
  });
});

describe('herd: color markings', () => {
  it('creates, lists, updates, imports and deletes color markings', async () => {
    const { owner, base, post } = await setup();
    const bw = await post('/color-markings', { name: 'Black & white', description: 'Patched' });
    await post('/color-markings', { name: 'Brindle' });
    expect((await owner.c.get(`${base}/color-markings`)).body.rows.map((r: { name: string }) => r.name)).toEqual(['Black & white', 'Brindle']);
    expect((await owner.c.post(`${base}/color-markings`, { name: 'brindle' })).body.error.details.name).toBeDefined();
    expect((await owner.c.post(`${base}/color-markings`, { name: 'x'.repeat(51) })).status).toBe(422);
    expect((await owner.c.put(`${base}/color-markings/${bw}`, { name: 'Black and white' })).status).toBe(200);
    const imported = await owner.c.post(`${base}/color-markings/import`, { rows: [{ color_name: 'Red', description: '' }, { color_name: 'Roan' }] });
    expect(imported.body.imported).toBe(2);
    expect((await owner.c.get(`${base}/color-markings?q=r`)).body.rows.map((r: { name: string }) => r.name)).toEqual(["Brindle", "Red", "Roan"]);
    expect((await owner.c.delete(`${base}/color-markings/${bw}`)).status).toBe(204);
    expect((await owner.c.get(`${base}/color-markings`)).body.rows).toHaveLength(3);
  });
});
