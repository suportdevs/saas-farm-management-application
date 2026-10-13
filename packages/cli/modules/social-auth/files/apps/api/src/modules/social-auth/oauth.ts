import crypto from 'node:crypto';
import { randomToken } from '../../core';
import { callbackURL, fetchJson, type OAuthTokens, type ProviderConfig } from './providers';

/** Authorization-code flow helpers (RFC 6749 + PKCE, RFC 7636). */

export function createPkce() {
  const verifier = randomToken(48);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function authorizationUrl(p: ProviderConfig, state: string, codeChallenge?: string): string {
  const url = new URL(p.authorizeUrl);
  const params: Record<string, string> = {
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: callbackURL(p.id),
    scope: p.scopes.join(p.scopeSeparator ?? ' '),
    state,
    ...p.extraAuthParams,
  };
  if (codeChallenge) {
    params.code_challenge = codeChallenge;
    params.code_challenge_method = 'S256';
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

export async function exchangeCode(p: ProviderConfig, code: string, codeVerifier?: string): Promise<OAuthTokens> {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callbackURL(p.id) });
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (p.tokenAuth === 'basic') {
    headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(p.clientId)}:${encodeURIComponent(p.clientSecret)}`).toString('base64')}`;
  } else {
    body.set('client_id', p.clientId);
    body.set('client_secret', p.clientSecret);
  }
  if (codeVerifier) body.set('code_verifier', codeVerifier);

  const tokens = await fetchJson<OAuthTokens & { error?: string; ok?: boolean }>(p.tokenUrl, { method: 'POST', headers, body });
  // Some providers (GitHub, Slack) answer 200 with an error payload.
  if (tokens.error || tokens.ok === false || typeof tokens.access_token !== 'string') {
    throw new Error(`Token exchange with ${p.name} failed: ${tokens.error ?? 'no access token'}`);
  }
  return tokens;
}
