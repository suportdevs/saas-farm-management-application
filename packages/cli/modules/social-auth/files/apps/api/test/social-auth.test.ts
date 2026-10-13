import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'google-id';
  process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
  process.env.GITHUB_CLIENT_ID = 'github-id';
  process.env.GITHUB_CLIENT_SECRET = 'github-secret';
  process.env.TWITTER_CLIENT_ID = 'x-id';
  process.env.TWITTER_CLIENT_SECRET = 'x-secret';
});

import { createApp } from '../src/app';
import { pool } from '../src/db/client';
import { uniqueEmail } from './helpers';

let app: Express;
beforeAll(async () => {
  app = await createApp();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await pool.end();
});

/** Starts a flow and returns the provider URL plus the state cookie. */
async function start(provider: string) {
  const agent = request.agent(app);
  const res = await agent.get(`/api/oauth/${provider}?next=/settings`);
  expect(res.status).toBe(302);
  return { agent, url: new URL(res.headers.location!) };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('social auth', () => {
  it('lists only configured providers', async () => {
    const res = await request(app).get('/api/oauth/providers');
    expect(res.body.providers.map((p: { id: string }) => p.id)).toEqual(['google', 'github', 'twitter']);
    expect((await request(app).get('/api/oauth/facebook')).status).toBe(404);
  });

  it('builds authorization URLs with state and PKCE where required', async () => {
    const google = (await start('google')).url;
    expect(google.origin + google.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(google.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/oauth/google/callback');
    expect(google.searchParams.get('code_challenge_method')).toBe('S256');
    expect(google.searchParams.get('state')).toBeTruthy();

    const x = (await start('twitter')).url;
    expect(x.host).toBe('x.com');
    expect(x.searchParams.get('code_challenge')).toBeTruthy();

    const gh = (await start('github')).url;
    expect(gh.searchParams.get('code_challenge')).toBeNull();
  });

  it('rejects callbacks with a forged state', async () => {
    const { agent } = await start('github');
    const res = await agent.get('/api/oauth/github/callback?code=abc&state=forged');
    expect(res.headers.location).toBe('http://localhost:3000/login?error=oauth_failed');
  });

  it('reports a cancelled consent screen', async () => {
    const { agent, url } = await start('github');
    const res = await agent.get(`/api/oauth/github/callback?error=access_denied&state=${url.searchParams.get('state')}`);
    expect(res.headers.location).toBe('http://localhost:3000/login?error=oauth_cancelled');
  });

  it('exchanges the code, creates the user and signs them in', async () => {
    const email = uniqueEmail('gh');
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.startsWith('https://github.com/login/oauth/access_token')) return json({ access_token: 'gho_token', token_type: 'bearer' });
      if (url === 'https://api.github.com/user') return json({ id: Date.now(), login: 'octo', name: 'Octo Cat', avatar_url: 'https://x/a.png' });
      if (url === 'https://api.github.com/user/emails') return json([{ email, primary: true, verified: true }]);
      throw new Error(`unexpected fetch ${url}`);
    });

    const { agent, url } = await start('github');
    const res = await agent.get(`/api/oauth/github/callback?code=the-code&state=${url.searchParams.get('state')}`);
    expect(res.headers.location).toBe('http://localhost:3000/settings');

    const tokenCall = calls.find((c) => c.url.includes('access_token'))!;
    const body = new URLSearchParams(String(tokenCall.init!.body));
    expect(body.get('code')).toBe('the-code');
    expect(body.get('client_secret')).toBe('github-secret');

    const me = await agent.get('/api/auth/me');
    expect(me.body.user).toMatchObject({ email, name: 'Octo Cat', emailVerified: true, hasPassword: false });
    expect((await agent.get('/api/oauth/accounts')).body.accounts).toEqual([expect.objectContaining({ provider: 'github', email })]);
  });

  it('uses HTTP Basic auth and the PKCE verifier for X', async () => {
    let tokenInit: RequestInit | undefined;
    vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.x.com/2/oauth2/token') {
        tokenInit = init;
        return json({ access_token: 'x-token' });
      }
      return json({ data: { id: String(Date.now()), name: 'X User', username: 'xuser', confirmed_email: uniqueEmail('x') } });
    });
    const { agent, url } = await start('twitter');
    await agent.get(`/api/oauth/twitter/callback?code=c&state=${url.searchParams.get('state')}`);
    const headers = tokenInit!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('x-id:x-secret').toString('base64')}`);
    expect(new URLSearchParams(String(tokenInit!.body)).get('code_verifier')).toHaveLength(64);
  });
});
