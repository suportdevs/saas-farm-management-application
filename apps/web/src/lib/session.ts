import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { AppFeatures, Impersonator, PublicUser } from '@kit/shared';
import { challengePath } from '@/modules/registry';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export interface SessionState {
  user: PublicUser | null;
  challenge: string | null;
  /** Set while an admin is signed in as this user. */
  impersonator?: Impersonator | null;
}

/** Server-side fetch to the API, forwarding the user's cookies. */
export async function serverFetch<T>(path: string): Promise<T | null> {
  const cookieHeader = (await cookies()).toString();
  try {
    const res = await fetch(`${API_URL}/api${path}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** GET /api/features, de-duplicated per request. */
export const getFeatures = cache(async (): Promise<AppFeatures | null> => serverFetch<AppFeatures>('/features'));

/**
 * Current session, de-duplicated per request. `unavailable` is set when the API
 * can't be reached or errors — that is NOT the same as being signed out.
 */
export const getSession = cache(async (): Promise<SessionState & { unavailable?: boolean }> => {
  const cookieHeader = (await cookies()).toString();
  try {
    const res = await fetch(`${API_URL}/api/auth/session`, { headers: { cookie: cookieHeader }, cache: 'no-store' });
    // /auth/session always answers 200 with JSON; anything else means API_URL points at the wrong service.
    const body = res.ok ? ((await res.json().catch(() => null)) as SessionState | null) : null;
    if (body && 'user' in body) return body;
    console.error(`[session] Unexpected response from ${API_URL}/api/auth/session (HTTP ${res.status}) — check API_URL`);
  } catch (err) {
    console.error(`[session] Cannot reach the API at ${API_URL} — is it running? (${(err as Error).message})`);
  }
  return { user: null, challenge: null, unavailable: true };
});

/** Use in admin pages. Unknown to non-admins (404). */
export async function requireAdmin(): Promise<PublicUser> {
  const user = await requireUser();
  if (user.role !== 'admin') notFound();
  return user;
}

/** Use in protected layouts/pages. Redirects to login (or the pending challenge). */
export async function requireUser(): Promise<PublicUser> {
  const { user, challenge, unavailable } = await getSession();
  if (user) return user;
  if (challenge) redirect(challengePath(challenge));
  // Don't bounce a signed-in user to /login just because the API is down or misconfigured.
  if (unavailable) throw new Error('The server is unavailable right now. Please try again in a moment.');
  redirect('/login');
}

export async function redirectIfAuthenticated() {
  const { user } = await getSession();
  if (user) redirect('/dashboard');
}
