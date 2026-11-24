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
  const base = `/api/farms/${farm.slug}/hr`;
  const post = async (path: string, body: object) => {
    const res = await owner.c.post(`${base}${path}`, body);
    expect(res.status).toBe(201);
    return res.body.key as string;
  };
  return { owner, farm, base, post };
}

const names = (body: { rows: { name: string }[] }) => body.rows.map((r) => r.name);

describe('hr: designations', () => {
  it('creates, lists, updates, imports and deletes designations; blocks deleting one in use', async () => {
    const { owner, base, post } = await setup();
    const herdsman = await post('/designations', { name: 'Herdsman', description: 'Looks after the herd' });
    await post('/designations', { name: 'Milker' });
    expect(names((await owner.c.get(`${base}/designations`)).body)).toEqual(['Herdsman', 'Milker']);
    expect((await owner.c.post(`${base}/designations`, { name: 'milker' })).body.error.details.name).toBeDefined();
    expect((await owner.c.put(`${base}/designations/${herdsman}`, { name: 'Senior herdsman' })).status).toBe(200);
    expect((await owner.c.post(`${base}/designations/import`, { rows: [{ name: 'Farm manager', description: '' }] })).body.imported).toBe(1);

    await post('/employees', { code: 'E-1', name: 'Karim', designationKey: herdsman });
    expect((await owner.c.delete(`${base}/designations/${herdsman}`)).status).toBe(409);
  });
});

describe('hr: employees', () => {
  it('manages employees with designation, pay and status; filters, searches and imports', async () => {
    const { owner, base, post } = await setup();
    const milker = await post('/designations', { name: 'Milker' });
    const karim = await post('/employees', {
      code: 'EMP-001',
      name: 'Abdul Karim',
      designationKey: milker,
      phone: '+8801711000000',
      email: 'karim@example.com',
      gender: 'Male',
      dateOfBirth: '1990-05-14',
      nidNumber: '1990123456789',
      joiningDate: '2024-01-01',
      employmentType: 'daily',
      salary: '650',
      address: 'Gazipur',
      emergencyContactName: 'Rahima',
      emergencyContactPhone: '+8801811000000',
      notes: 'Night shift',
    });
    await post('/employees', { code: 'EMP-002', name: 'Salma', joiningDate: '2025-03-01' });

    const list = (await owner.c.get(`${base}/employees`)).body.rows;
    expect(list.find((r: { key: string }) => r.key === karim)).toMatchObject({
      code: 'EMP-001',
      designationName: 'Milker',
      gender: 'male',
      employmentType: 'daily',
      salary: 650,
      status: 1,
      emergencyContactPhone: '+8801811000000',
    });
    // Defaults: permanent, active.
    expect(list.find((r: { code: string }) => r.code === 'EMP-002')).toMatchObject({ employmentType: 'permanent', status: 1, designationName: null });

    // Unique employee ID, required fields, valid email.
    const bad = await owner.c.post(`${base}/employees`, { code: 'emp-001', name: '', email: 'nope' });
    expect(Object.keys(bad.body.error.details).sort()).toEqual(['email', 'name']);
    expect((await owner.c.post(`${base}/employees`, { code: 'emp-001', name: 'X' })).body.error.details.code).toBeDefined();

    // Filters and search.
    expect(names((await owner.c.get(`${base}/employees?designation=${milker}`)).body)).toEqual(['Abdul Karim']);
    expect(names((await owner.c.get(`${base}/employees?employment_type=permanent`)).body)).toEqual(['Salma']);
    expect(names((await owner.c.get(`${base}/employees?joining_dateFrom=2025-01-01`)).body)).toEqual(['Salma']);
    expect(names((await owner.c.get(`${base}/employees?q=0171`)).body)).toEqual(['Abdul Karim']);

    // Status toggle (left the farm) and the status filter.
    expect((await owner.c.post(`${base}/employees/toggle-status`, { keys: [karim] })).status).toBe(200);
    expect(names((await owner.c.get(`${base}/employees?status=0`)).body)).toEqual(['Abdul Karim']);

    // Import matches the designation by name.
    const imported = await owner.c.post(`${base}/employees/import`, { rows: [{ employee_code: 'EMP-003', name: 'Rafiq', designation: 'milker', employment_type: 'Contract', status: 'Active' }] });
    expect(imported.status).toBe(201);
    expect((await owner.c.get(`${base}/employees?q=Rafiq`)).body.rows[0]).toMatchObject({ designationName: 'Milker', employmentType: 'contract' });

    expect((await owner.c.delete(`${base}/employees/${karim}`)).status).toBe(204);
  });

  it('keeps HR to owners and managers by default', async () => {
    const { owner, farm, base } = await setup();
    const worker = await inviteAndJoin(app, owner, farm.slug, 'worker');
    expect((await worker.c.get(`${base}/employees`)).status).toBe(403);
    expect((await worker.c.post(`${base}/designations`, { name: 'X' })).status).toBe(403);
  });
});
