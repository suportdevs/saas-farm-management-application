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
    const barn = await post('/pens', { name: 'Barn A', code: 'BA', type: 'barn', capacity: '60' });
    await post('/pens', { name: 'Calf pen', type: 'Calf pen' });

    const list = await owner.c.get(`${base}/pens`);
    expect(list.status).toBe(200);
    expect(list.body.rows.map((r: { name: string }) => r.name)).toEqual(['Barn A', 'Calf pen']);
    expect(list.body.rows[0]).toMatchObject({ code: 'BA', type: 'barn', capacity: 60, status: 1 });
    // Labels are accepted and stored as values.
    expect(list.body.rows[1].type).toBe('calf_pen');

    expect((await owner.c.get(`${base}/pens?type=barn`)).body.rows).toHaveLength(1);
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
  it('groups animals into batches; blocks deleting a batch or pen in use', async () => {
    const { owner, base, post } = await setup();
    const barn = await post('/pens', { name: 'Barn A', code: 'BA' });
    const calves = await post('/batches', { name: 'Calves 2025', code: 'CALF-25', purpose: 'Calves', penKey: barn, startDate: '2025-01-01' });
    await post('/batches', { name: 'Dry cows', purpose: 'dry', startDate: '2024-06-01' });

    const list = await owner.c.get(`${base}/batches`);
    expect(list.body.rows.map((r: { name: string }) => r.name)).toEqual(['Calves 2025', 'Dry cows']);
    expect(list.body.rows[0]).toMatchObject({ code: 'CALF-25', purpose: 'calves', penName: 'Barn A', startDate: '2025-01-01', status: 1 });
    // Date range filter on the start date.
    expect((await owner.c.get(`${base}/batches?start_dateFrom=2025-01-01`)).body.rows).toHaveLength(1);
    expect((await owner.c.get(`${base}/batches?start_dateTo=2024-12-31`)).body.rows[0].name).toBe('Dry cows');
    expect((await owner.c.post(`${base}/batches`, { name: 'calves 2025' })).status).toBe(422);

    // The pen now holds a batch: it can't be deleted.
    expect((await owner.c.delete(`${base}/pens/${barn}`)).body.error.message).toMatch(/1 batch uses/);

    const calf = await post('', { tag: 'C-1', sex: 'female', batchKey: calves });
    expect((await owner.c.get(`${base}?batch=${calves}`)).body.rows.map((r: { tag: string }) => r.tag)).toEqual(['C-1']);
    expect((await owner.c.get(base)).body.rows[0]).toMatchObject({ batchKey: calves, batchName: 'Calves 2025' });
    expect((await owner.c.delete(`${base}/batches/${calves}`)).body.error.code).toBe('IN_USE');

    // Imports match the batch by code.
    const imported = await owner.c.post(`${base}/import`, { rows: [{ tag: 'C-2', sex: 'male', batch: 'CALF-25' }] });
    expect(imported.status).toBe(201);
    expect((await owner.c.get(`${base}?batch=${calves}`)).body.rows).toHaveLength(2);

    await owner.c.put(`${base}/${calf}`, { tag: 'C-1', sex: 'female', batchKey: '' });
    expect((await owner.c.get(`${base}?batch=${calves}`)).body.rows).toHaveLength(1);
  });
});

describe('herd: weights', () => {
  it('records weighings, keeps the animal on its latest weight, filters by date and imports', async () => {
    const { owner, base, post } = await setup();
    const bella = await post('', { tag: 'BD-1', sex: 'female' });
    const max = await post('', { tag: 'BD-2', sex: 'male', weight: '400' });
    const weightOf = async (key: string) => (await owner.c.get(base)).body.rows.find((r: { key: string }) => r.key === key).weight;

    const first = await post('/weights', { animalKey: bella, weighedOn: '2025-01-10', weight: '210', method: 'Scale' });
    const second = await post('/weights', { animalKey: bella, weighedOn: '2025-03-10', weight: '255.5' });
    // An older weighing entered later doesn't replace the latest one.
    await post('/weights', { animalKey: bella, weighedOn: '2024-12-01', weight: '190', method: 'tape' });
    expect(await weightOf(bella)).toBe(255.5);
    expect(await weightOf(max)).toBe(400);

    const list = await owner.c.get(`${base}/weights`);
    expect(list.body.rows.map((r: { weighedOn: string }) => r.weighedOn)).toEqual(['2025-03-10', '2025-01-10', '2024-12-01']);
    expect(list.body.rows[1]).toMatchObject({ key: first, animalKey: bella, animalName: 'BD-1', weight: 210, method: 'scale' });

    expect((await owner.c.get(`${base}/weights?dateFrom=2025-01-01&dateTo=2025-02-28`)).body.rows).toHaveLength(1);
    expect((await owner.c.get(`${base}/weights?animal=${max}`)).body.rows).toHaveLength(0);
    expect((await owner.c.get(`${base}/weights?weightMin=200`)).body.rows).toHaveLength(2);

    // Editing or deleting the latest weighing moves the animal back.
    await owner.c.put(`${base}/weights/${second}`, { animalKey: bella, weighedOn: '2025-03-10', weight: '260' });
    expect(await weightOf(bella)).toBe(260);
    expect((await owner.c.delete(`${base}/weights/${second}`)).status).toBe(204);
    expect(await weightOf(bella)).toBe(210);

    // Validation: animal, date and weight are required.
    const bad = await owner.c.post(`${base}/weights`, { weight: '' });
    expect(Object.keys(bad.body.error.details).sort()).toEqual(['animalKey', 'weighedOn', 'weight']);

    // Imports match the animal by ear tag.
    const imported = await owner.c.post(`${base}/weights/import`, {
      rows: [
        { animal: 'BD-2', date: '2025-05-01', weight: '420', method: 'Scale' },
        { animal: 'bd-1', date: '2025-05-01', weight: '270' },
      ],
    });
    expect(imported.status).toBe(201);
    expect(await weightOf(max)).toBe(420);
    expect(await weightOf(bella)).toBe(270);
    const unknown = await owner.c.post(`${base}/weights/import`, { rows: [{ animal: 'NOPE', date: '2025-05-01', weight: '1' }] });
    expect(unknown.body.error.details['rows.0.animal']).toEqual(['No animal "NOPE"']);

    // Deleting an animal takes its weight records with it.
    expect((await owner.c.delete(`${base}/${max}`)).status).toBe(204);
    expect((await owner.c.get(`${base}/weights`)).body.rows.every((r: { animalName: string }) => r.animalName === 'BD-1')).toBe(true);
  });

  it('lets workers record weights but not delete them', async () => {
    const { owner, farm, base, post } = await setup();
    const cow = await post('', { tag: 'W-1', sex: 'female' });
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    const rec = await worker.c.post(`${base}/weights`, { animalKey: cow, weighedOn: '2025-02-02', weight: '300' });
    expect(rec.status).toBe(201);
    expect((await worker.c.delete(`${base}/weights/${rec.body.key}`)).status).toBe(403);
    expect((await worker.c.post(`${base}/batches`, { name: 'Mine' })).status).toBe(403);
    expect((await worker.c.get(`${base}/batches`)).status).toBe(200);
  });
});
