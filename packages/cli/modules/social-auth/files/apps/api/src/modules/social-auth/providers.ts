import { z } from 'zod';
import { env, parseModuleEnv } from '../../core';

/** Provider-agnostic identity returned by every provider. */
export interface OAuthProfile {
  provider: string;
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
  image: string | null;
}

export interface OAuthTokens {
  access_token: string;
  [key: string]: unknown;
}

export interface ProviderConfig {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  scopeSeparator?: string;
  /** Send PKCE code_challenge (required by X, recommended where supported). */
  pkce: boolean;
  /** How the client authenticates at the token endpoint. */
  tokenAuth: 'body' | 'basic';
  extraAuthParams?: Record<string, string>;
  profile: (tokens: OAuthTokens) => Promise<OAuthProfile>;
}

const config = parseModuleEnv(
  'social-auth',
  z.object({
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    FACEBOOK_CLIENT_ID: z.string().optional(),
    FACEBOOK_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    TWITTER_CLIENT_ID: z.string().optional(),
    TWITTER_CLIENT_SECRET: z.string().optional(),
    LINKEDIN_CLIENT_ID: z.string().optional(),
    LINKEDIN_CLIENT_SECRET: z.string().optional(),
    BITBUCKET_CLIENT_ID: z.string().optional(),
    BITBUCKET_CLIENT_SECRET: z.string().optional(),
    GITLAB_CLIENT_ID: z.string().optional(),
    GITLAB_CLIENT_SECRET: z.string().optional(),
    GITLAB_BASE_URL: z.string().optional(),
    SLACK_CLIENT_ID: z.string().optional(),
    SLACK_CLIENT_SECRET: z.string().optional(),
    OAUTH_REDIRECT_BASE_URL: z.string().optional(),
  }),
);

export const callbackURL = (provider: string) =>
  `${(config.OAUTH_REDIRECT_BASE_URL || env.WEB_URL).replace(/\/$/, '')}/api/oauth/${provider}/callback`;

/** GET/POST JSON with a bearer token; throws with the provider's message on failure. */
export async function fetchJson<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      Accept: 'application/json',
      'User-Agent': env.APP_NAME,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || body === null) throw new Error(`OAuth request to ${new URL(url).host} failed (${res.status})`);
  return body;
}

const lower = (email: unknown) => (typeof email === 'string' && email ? email.toLowerCase() : null);
const fallbackName = (email: string | null) => email?.split('@')[0] ?? 'User';

/** OpenID Connect userinfo — Google, LinkedIn, GitLab and Slack share this shape. */
async function oidcProfile(provider: string, url: string, tokens: OAuthTokens): Promise<OAuthProfile> {
  const u = await fetchJson<{ sub: string; email?: string; email_verified?: boolean | string; name?: string; picture?: string }>(url, {
    token: tokens.access_token,
  });
  const email = lower(u.email);
  return {
    provider,
    id: String(u.sub),
    email,
    emailVerified: Boolean(email) && (u.email_verified === true || u.email_verified === 'true'),
    name: u.name || fallbackName(email),
    image: u.picture ?? null,
  };
}

type Definition = Omit<ProviderConfig, 'clientId' | 'clientSecret'>;

const gitlabBase = (config.GITLAB_BASE_URL || 'https://gitlab.com').replace(/\/$/, '');

/** Every supported provider. Only those with credentials in the env are enabled. */
const definitions: Record<string, Definition> = {
  google: {
    id: 'google',
    name: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['openid', 'email', 'profile'],
    pkce: true,
    tokenAuth: 'body',
    extraAuthParams: { prompt: 'select_account' },
    profile: (t) => oidcProfile('google', 'https://openidconnect.googleapis.com/v1/userinfo', t),
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    authorizeUrl: 'https://www.facebook.com/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/oauth/access_token',
    scopes: ['email', 'public_profile'],
    scopeSeparator: ',',
    pkce: false,
    tokenAuth: 'body',
    async profile(t) {
      const u = await fetchJson<{ id: string; name?: string; email?: string; picture?: { data?: { url?: string } } }>(
        'https://graph.facebook.com/me?fields=id,name,email,picture.width(256).height(256)',
        { token: t.access_token },
      );
      const email = lower(u.email);
      // Facebook only returns confirmed addresses.
      return { provider: 'facebook', id: u.id, email, emailVerified: Boolean(email), name: u.name || fallbackName(email), image: u.picture?.data?.url ?? null };
    },
  },
  github: {
    id: 'github',
    name: 'GitHub',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['read:user', 'user:email'],
    pkce: false,
    tokenAuth: 'body',
    async profile(t) {
      const [u, emails] = await Promise.all([
        fetchJson<{ id: number; login: string; name: string | null; avatar_url: string }>('https://api.github.com/user', { token: t.access_token }),
        fetchJson<{ email: string; primary: boolean; verified: boolean }[]>('https://api.github.com/user/emails', { token: t.access_token }),
      ]);
      const e = emails.find((x) => x.primary && x.verified) ?? emails.find((x) => x.verified);
      return { provider: 'github', id: String(u.id), email: lower(e?.email), emailVerified: Boolean(e), name: u.name || u.login, image: u.avatar_url };
    },
  },
  twitter: {
    id: 'twitter',
    name: 'X',
    authorizeUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    // users.email requires "Request email from users" in the X developer portal.
    scopes: ['users.read', 'tweet.read', 'users.email'],
    pkce: true,
    tokenAuth: 'basic',
    async profile(t) {
      const { data: u } = await fetchJson<{ data: { id: string; name: string; username: string; profile_image_url?: string; confirmed_email?: string } }>(
        'https://api.x.com/2/users/me?user.fields=profile_image_url,confirmed_email',
        { token: t.access_token },
      );
      const email = lower(u.confirmed_email);
      return { provider: 'twitter', id: u.id, email, emailVerified: Boolean(email), name: u.name || u.username, image: u.profile_image_url ?? null };
    },
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['openid', 'profile', 'email'],
    pkce: false,
    tokenAuth: 'body',
    profile: (t) => oidcProfile('linkedin', 'https://api.linkedin.com/v2/userinfo', t),
  },
  bitbucket: {
    id: 'bitbucket',
    name: 'Bitbucket',
    authorizeUrl: 'https://bitbucket.org/site/oauth2/authorize',
    tokenUrl: 'https://bitbucket.org/site/oauth2/access_token',
    scopes: ['account', 'email'],
    pkce: false,
    tokenAuth: 'basic',
    async profile(t) {
      const [u, emails] = await Promise.all([
        fetchJson<{ uuid: string; display_name?: string; nickname?: string; links?: { avatar?: { href?: string } } }>('https://api.bitbucket.org/2.0/user', {
          token: t.access_token,
        }),
        fetchJson<{ values: { email: string; is_primary: boolean; is_confirmed: boolean }[] }>('https://api.bitbucket.org/2.0/user/emails', {
          token: t.access_token,
        }),
      ]);
      const e = emails.values.find((x) => x.is_primary && x.is_confirmed) ?? emails.values.find((x) => x.is_confirmed);
      return {
        provider: 'bitbucket',
        id: u.uuid,
        email: lower(e?.email),
        emailVerified: Boolean(e),
        name: u.display_name || u.nickname || 'User',
        image: u.links?.avatar?.href ?? null,
      };
    },
  },
  gitlab: {
    id: 'gitlab',
    name: 'GitLab',
    authorizeUrl: `${gitlabBase}/oauth/authorize`,
    tokenUrl: `${gitlabBase}/oauth/token`,
    scopes: ['openid', 'profile', 'email'],
    pkce: true,
    tokenAuth: 'body',
    profile: (t) => oidcProfile('gitlab', `${gitlabBase}/oauth/userinfo`, t),
  },
  slack: {
    id: 'slack',
    name: 'Slack',
    authorizeUrl: 'https://slack.com/openid/connect/authorize',
    tokenUrl: 'https://slack.com/api/openid.connect.token',
    scopes: ['openid', 'email', 'profile'],
    pkce: false,
    tokenAuth: 'body',
    async profile(t) {
      const u = await fetchJson<{ ok?: boolean; sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string; 'https://slack.com/team_id'?: string }>(
        'https://slack.com/api/openid.connect.userInfo',
        { token: t.access_token },
      );
      if (u.ok === false) throw new Error('Slack userinfo failed');
      const email = lower(u.email);
      // User ids are only unique within a workspace.
      const team = u['https://slack.com/team_id'];
      return { provider: 'slack', id: team ? `${team}:${u.sub}` : u.sub, email, emailVerified: Boolean(email && u.email_verified), name: u.name || fallbackName(email), image: u.picture ?? null };
    },
  },
};

const credentials: Record<string, [string | undefined, string | undefined]> = {
  google: [config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET],
  facebook: [config.FACEBOOK_CLIENT_ID, config.FACEBOOK_CLIENT_SECRET],
  github: [config.GITHUB_CLIENT_ID, config.GITHUB_CLIENT_SECRET],
  twitter: [config.TWITTER_CLIENT_ID, config.TWITTER_CLIENT_SECRET],
  linkedin: [config.LINKEDIN_CLIENT_ID, config.LINKEDIN_CLIENT_SECRET],
  bitbucket: [config.BITBUCKET_CLIENT_ID, config.BITBUCKET_CLIENT_SECRET],
  gitlab: [config.GITLAB_CLIENT_ID, config.GITLAB_CLIENT_SECRET],
  slack: [config.SLACK_CLIENT_ID, config.SLACK_CLIENT_SECRET],
};

/** Enabled providers, in display order. */
export const providers = new Map<string, ProviderConfig>();
for (const [id, def] of Object.entries(definitions)) {
  const [clientId, clientSecret] = credentials[id] ?? [];
  if (clientId && clientSecret) providers.set(id, { ...def, clientId, clientSecret });
}
