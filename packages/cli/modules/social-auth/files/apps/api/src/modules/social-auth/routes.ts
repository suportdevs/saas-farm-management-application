import type { Request, Response } from 'express';
import { Router } from 'express';
import {
  AppError,
  badRequest,
  decrypt,
  encrypt,
  env,
  isProd,
  logger,
  notFound,
  randomToken,
  requireAuth,
  safeEqual,
  signIn,
} from '../../core';
import { authorizationUrl, createPkce, exchangeCode } from './oauth';
import { providers } from './providers';
import { OAuthError, findOrCreateUser, linkAccount, listAccounts, unlinkAccount } from './service';

export const router = Router();

const STATE_COOKIE = 'oauth_state';
const STATE_PURPOSE = 'oauth-state';

interface OAuthState {
  provider: string;
  state: string;
  verifier?: string;
  next: string;
  mode: 'login' | 'link';
}

const safeNext = (v: unknown, fallback: string) =>
  typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : fallback;

const webRedirect = (res: Response, path: string) => res.redirect(`${env.WEB_URL}${path}`);

// The state (incl. the PKCE verifier) is encrypted, so it can't be read or forged from the cookie.
function writeState(res: Response, data: OAuthState) {
  res.cookie(STATE_COOKIE, encrypt(JSON.stringify(data), STATE_PURPOSE), {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax', // must survive the top-level redirect back from the provider
    maxAge: 10 * 60 * 1000,
    path: '/api/oauth',
  });
}

function readState(req: Request, res: Response): OAuthState | null {
  const raw = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: '/api/oauth' });
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(decrypt(raw, STATE_PURPOSE)) as OAuthState;
  } catch {
    return null;
  }
}

router.get('/providers', (_req, res) => {
  res.json({ providers: [...providers.values()].map(({ id, name }) => ({ id, name })) });
});

router.get('/accounts', requireAuth, async (req, res) => {
  res.json({ accounts: await listAccounts(req.auth!.user.id) });
});

router.delete('/accounts/:provider', requireAuth, async (req, res) => {
  try {
    if (!(await unlinkAccount(req.auth!.user, String(req.params.provider)))) throw notFound('Account not linked');
  } catch (err) {
    if (err instanceof OAuthError && err.code === 'last_login_method') {
      throw badRequest('Set a password before disconnecting your only sign-in method', 'LAST_LOGIN_METHOD');
    }
    throw err;
  }
  res.status(204).end();
});

/** Starts the OAuth dance: /api/oauth/google?next=/dashboard[&mode=link] */
router.get('/:provider', (req, res) => {
  const provider = providers.get(String(req.params.provider));
  if (!provider) throw notFound('Unknown or unconfigured provider');

  const mode = req.query.mode === 'link' ? 'link' : 'login';
  if (mode === 'link' && (!req.auth || req.auth.session.pending)) return webRedirect(res, '/login');

  const state = randomToken(16);
  const pkce = provider.pkce ? createPkce() : null;
  writeState(res, {
    provider: provider.id,
    state,
    verifier: pkce?.verifier,
    mode,
    next: safeNext(req.query.next, mode === 'link' ? '/settings/security' : '/dashboard'),
  });
  res.redirect(authorizationUrl(provider, state, pkce?.challenge));
});

router.get('/:provider/callback', async (req, res) => {
  const provider = providers.get(String(req.params.provider));
  if (!provider) throw notFound('Unknown or unconfigured provider');

  const saved = readState(req, res);
  const returned = typeof req.query.state === 'string' ? req.query.state : '';
  if (!saved || saved.provider !== provider.id || !returned || !safeEqual(saved.state, returned)) {
    return webRedirect(res, '/login?error=oauth_failed');
  }
  const failPath = saved.mode === 'link' ? '/settings/security?error=' : '/login?error=';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) {
    // e.g. ?error=access_denied when the user cancels on the provider's screen.
    return webRedirect(res, `${failPath}${req.query.error === 'access_denied' ? 'oauth_cancelled' : 'oauth_failed'}`);
  }

  try {
    const tokens = await exchangeCode(provider, code, saved.verifier);
    const profile = await provider.profile(tokens);

    if (saved.mode === 'link') {
      if (!req.auth || req.auth.session.pending) return webRedirect(res, '/login');
      await linkAccount(req.auth.user.id, profile);
      return webRedirect(res, `${saved.next}${saved.next.includes('?') ? '&' : '?'}linked=${provider.id}`);
    }

    const user = await findOrCreateUser(profile);
    await signIn(req, res, user, { method: `oauth:${provider.id}` });
    // If a challenge (e.g. 2FA) is pending, the web app redirects to it.
    return webRedirect(res, saved.next);
  } catch (e) {
    if (e instanceof OAuthError) return webRedirect(res, `${failPath}${e.code}`);
    if (e instanceof AppError && e.code === 'ACCOUNT_SUSPENDED') return webRedirect(res, `${failPath}account_suspended`);
    logger.warn({ err: e, provider: provider.id }, 'OAuth callback failed');
    return webRedirect(res, `${failPath}oauth_failed`);
  }
});
