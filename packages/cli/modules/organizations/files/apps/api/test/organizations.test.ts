import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => [] as { to: string; text?: string }[]);
vi.mock('../src/lib/mailer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/mailer')>()),
  sendMail: vi.fn(async (m: { to: string; text?: string }) => {
    sent.push(m);
  }),
}));

import { createApp } from '../src/app';
import { pool } from '../src/db/client';
import { client, signUp, uniqueEmail } from './helpers';

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
beforeEach(() => {
  sent.length = 0;
});
afterAll(async () => {
  await pool.end();
});

/** Pulls the invitation token out of the captured email. */
const inviteToken = (email: string) => {
  const match = sent.find((m) => m.to === email)?.text?.match(/invite\?token=([^\s&]+)/);
  return match ? decodeURIComponent(match[1]!) : undefined;
};

async function orgWithOwner() {
  const owner = await signUp(app, { name: 'Olivia Owner' });
  const res = await owner.c.post('/api/organizations', { name: 'Acme Inc' });
  expect(res.status).toBe(201);
  return { owner, org: res.body.organization as { id: string; slug: string } };
}

describe('organizations', () => {
  it('creates an org with the creator as owner and a unique slug', async () => {
    const { owner, org } = await orgWithOwner();
    expect(org.slug).toMatch(/^acme-inc/);
    const list = await owner.c.get('/api/organizations');
    expect(list.body.organizations).toEqual([expect.objectContaining({ id: org.id, role: 'owner', memberCount: 1 })]);
    // Lookup by slug works too.
    expect((await owner.c.get(`/api/organizations/${org.slug}`)).body.organization.id).toBe(org.id);
  });

  it('hides orgs from non-members', async () => {
    const { org } = await orgWithOwner();
    const stranger = await signUp(app);
    expect((await stranger.c.get(`/api/organizations/${org.id}`)).status).toBe(404);
  });

  it('invites by email and lets only the invited address accept', async () => {
    const { owner, org } = await orgWithOwner();
    const inviteeEmail = uniqueEmail('invitee');

    const inv = await owner.c.post(`/api/organizations/${org.id}/invitations`, { email: inviteeEmail, role: 'admin' });
    expect(inv.status).toBe(201);
    const token = inviteToken(inviteeEmail);
    expect(token).toBeTruthy();

    const lookup = await client(app).post('/api/organizations/invitations/lookup', { token });
    expect(lookup.body.invitation).toMatchObject({ email: inviteeEmail, role: 'admin', invitedBy: 'Olivia Owner' });

    const wrongUser = await signUp(app);
    const mismatch = await wrongUser.c.post('/api/organizations/invitations/accept', { token });
    expect(mismatch.body.error.code).toBe('INVITATION_EMAIL_MISMATCH');

    const invitee = await signUp(app, { email: inviteeEmail });
    expect((await invitee.c.post('/api/organizations/invitations/accept', { token })).status).toBe(200);
    const members = await owner.c.get(`/api/organizations/${org.id}/members`);
    expect(members.body.members.map((m: { email: string; role: string }) => [m.email, m.role])).toContainEqual([inviteeEmail, 'admin']);

    // Single use.
    expect((await invitee.c.post('/api/organizations/invitations/accept', { token })).status).toBe(400);
  });

  it('enforces role rules', async () => {
    const { owner, org } = await orgWithOwner();
    const email = uniqueEmail('member');
    await owner.c.post(`/api/organizations/${org.id}/invitations`, { email, role: 'member' });
    const member = await signUp(app, { email });
    await member.c.post('/api/organizations/invitations/accept', { token: inviteToken(email) });

    // Members can't invite or rename.
    expect((await member.c.post(`/api/organizations/${org.id}/invitations`, { email: uniqueEmail() })).status).toBe(403);
    expect((await member.c.patch(`/api/organizations/${org.id}`, { name: 'Nope' })).status).toBe(403);

    // The last owner can't leave or be demoted.
    const leave = await owner.c.delete(`/api/organizations/${org.id}/members/${owner.id}`);
    expect(leave.body.error.code).toBe('LAST_OWNER');

    // Transfer ownership, then the old owner may leave.
    expect((await owner.c.patch(`/api/organizations/${org.id}/members/${member.id}`, { role: 'owner' })).status).toBe(204);
    expect((await owner.c.delete(`/api/organizations/${org.id}/members/${owner.id}`)).status).toBe(204);
    expect((await owner.c.get(`/api/organizations/${org.id}`)).status).toBe(404);
  });

  it('hands ownership to the next member when the owner deletes their account', async () => {
    const { owner, org } = await orgWithOwner();
    const email = uniqueEmail('heir');
    await owner.c.post(`/api/organizations/${org.id}/invitations`, { email });
    const heir = await signUp(app, { email });
    await heir.c.post('/api/organizations/invitations/accept', { token: inviteToken(email) });

    expect((await owner.c.delete('/api/users/me', { password: 'Passw0rd!' })).status).toBe(204);
    const res = await heir.c.get(`/api/organizations/${org.id}`);
    expect(res.body.organization.role).toBe('owner');
  });
});
