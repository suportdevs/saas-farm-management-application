import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { pool } from '../src/db/client';
import { client, signUp } from './helpers';

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await pool.end();
});

describe('passkeys', () => {
  it('issues registration options for discoverable credentials', async () => {
    const { c, email } = await signUp(app);
    const res = await c.post('/api/passkeys/register/options');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      rp: { id: 'localhost' },
      user: { name: email },
      authenticatorSelection: { residentKey: 'required' },
    });
    expect(res.headers['set-cookie']?.[0]).toMatch(/passkey_challenge=.*HttpOnly/);
    expect((await c.get('/api/passkeys')).body.passkeys).toEqual([]);
  });

  it('requires a session to register', async () => {
    expect((await client(app).post('/api/passkeys/register/options')).status).toBe(401);
  });

  it('issues usernameless login options and rejects unknown credentials', async () => {
    const c = client(app);
    const options = await c.post('/api/passkeys/login/options');
    expect(options.body.rpId).toBe('localhost');
    expect(options.body.allowCredentials ?? []).toEqual([]);

    const res = await c.post('/api/passkeys/login/verify', {
      response: { id: 'unknown-credential', rawId: 'unknown-credential', type: 'public-key', response: {}, clientExtensionResults: {} },
    });
    expect(res.body.error.code).toBe('PASSKEY_UNKNOWN');
  });

  it('rejects a verify call without a pending challenge', async () => {
    const res = await client(app).post('/api/passkeys/login/verify', {
      response: { id: 'x', rawId: 'x', type: 'public-key', response: {}, clientExtensionResults: {} },
    });
    expect(res.body.error.code).toBe('PASSKEY_CHALLENGE_EXPIRED');
  });
});
