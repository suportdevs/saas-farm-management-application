import type { Express } from 'express';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { users } from '../src/db/schema';

export const PASSWORD = 'Passw0rd!';
let seq = 0;
export const uniqueEmail = (tag = 'user') => `${tag}-${Date.now()}-${++seq}@example.com`;

/** Supertest agent that keeps cookies and sends the CSRF header. */
export function client(app: Express) {
  const agent = request.agent(app);
  return {
    agent,
    get: (url: string) => agent.get(url),
    post: (url: string, body?: object) => agent.post(url).set('X-Requested-With', 'test').send(body ?? {}),
    patch: (url: string, body?: object) => agent.patch(url).set('X-Requested-With', 'test').send(body ?? {}),
    put: (url: string, body?: object) => agent.put(url).set('X-Requested-With', 'test').send(body ?? {}),
    delete: (url: string, body?: object) => agent.delete(url).set('X-Requested-With', 'test').send(body ?? {}),
  };
}

/** Registers a user (optionally promoting to admin) and returns a signed-in client. */
export async function signUp(app: Express, opts: { admin?: boolean; name?: string; email?: string } = {}) {
  const c = client(app);
  const email = opts.email ?? uniqueEmail(opts.admin ? 'admin' : 'user');
  const res = await c.post('/api/auth/register', { name: opts.name ?? 'Test User', email, password: PASSWORD });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const id = res.body.user.id as string;
  if (opts.admin) await db.update(users).set({ role: 'admin' }).where(eq(users.id, id));
  return { c, id, email };
}
