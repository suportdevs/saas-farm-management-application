import type { Express } from 'express';
import { expect } from 'vitest';
import { signUp } from './helpers';

type Client = Awaited<ReturnType<typeof signUp>>['c'];

/**
 * Invitation emails captured instead of sent. Each test file mocks the farms
 * mailer with:
 *   vi.mock('../src/modules/farms/services/email.service', () => import('./farm-helpers').then((m) => m.farmEmailsMock));
 */
export const sentInvites: { to: string; token: string }[] = [];
export const farmEmailsMock = {
  sendInvitationEmail: async (opts: { to: string; token: string }) => {
    sentInvites.push({ to: opts.to, token: opts.token });
  },
};

export const farmInput = (name = 'Green Valley Dairy') => ({
  name,
  type: 'dairy',
  country: 'NZ',
  timezone: 'Pacific/Auckland',
  currency: 'NZD',
  locale: 'en-NZ',
  unitSystem: 'metric',
  milkUnit: 'L',
  weightUnit: 'kg',
  areaUnit: 'ha',
  region: 'Waikato',
  herdSize: '320',
  totalArea: 180.5,
  goals: ['milk_yield'],
});

export async function createFarm(c: Client, name?: string) {
  const res = await c.post('/api/farms', farmInput(name));
  expect(res.status).toBe(201);
  return res.body as { farm: { id: string; slug: string; name: string } };
}

/** Invites a new user with `role` and accepts the invitation as them. */
export async function inviteAndJoin(app: Express, owner: { c: Client }, slug: string, role: string) {
  const member = await signUp(app);
  const res = await owner.c.post(`/api/farms/${slug}/invitations`, { email: member.email, role });
  expect(res.status).toBe(201);
  const { token } = sentInvites.findLast((i) => i.to === member.email)!;
  expect((await member.c.post('/api/farms/invitations/accept', { token })).status).toBe(200);
  return member;
}
