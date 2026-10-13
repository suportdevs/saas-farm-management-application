import type { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { badRequest, db, decrypt, encrypt, env, isProd, parseModuleEnv, type User } from '../../core';
import { passkeys, type Passkey } from './schema';

const config = parseModuleEnv(
  'passkeys',
  z.object({
    // Relying party id: your registrable domain, e.g. "example.com". Defaults to the WEB_URL host.
    PASSKEY_RP_ID: z.string().optional(),
    PASSKEY_RP_NAME: z.string().optional(),
  }),
);

const webUrl = new URL(env.WEB_URL);
const rpID = config.PASSKEY_RP_ID || webUrl.hostname;
const rpName = config.PASSKEY_RP_NAME || env.APP_NAME;
const expectedOrigin = webUrl.origin;

// ─── Challenge cookie ─────────────────────────────────────────────────────
// The challenge lives in an encrypted, short-lived cookie bound to the ceremony type.

const CHALLENGE_COOKIE = 'passkey_challenge';
const CHALLENGE_TTL = 5 * 60 * 1000;
type Ceremony = 'register' | 'login';

function saveChallenge(res: Response, ceremony: Ceremony, challenge: string, userId?: string) {
  const payload = JSON.stringify({ ceremony, challenge, userId, exp: Date.now() + CHALLENGE_TTL });
  res.cookie(CHALLENGE_COOKIE, encrypt(payload, 'passkey'), {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: CHALLENGE_TTL,
    path: '/api/passkeys',
  });
}

function takeChallenge(req: Request, res: Response, ceremony: Ceremony, userId?: string): string {
  const raw = req.cookies?.[CHALLENGE_COOKIE];
  res.clearCookie(CHALLENGE_COOKIE, { path: '/api/passkeys' });
  try {
    const data = JSON.parse(decrypt(String(raw), 'passkey')) as { ceremony: Ceremony; challenge: string; userId?: string; exp: number };
    if (data.ceremony === ceremony && data.exp > Date.now() && data.userId === userId) return data.challenge;
  } catch {
    // fall through
  }
  throw badRequest('The passkey request expired. Please try again.', 'PASSKEY_CHALLENGE_EXPIRED');
}

// ─── Registration ─────────────────────────────────────────────────────────

export function listPasskeys(userId: string) {
  return db.select().from(passkeys).where(eq(passkeys.userId, userId)).orderBy(passkeys.createdAt);
}

export async function registrationOptions(res: Response, user: User) {
  const existing = await listPasskeys(user.id);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    // Discoverable credentials so users can sign in without typing their email.
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports ?? undefined })),
  });
  saveChallenge(res, 'register', options.challenge, user.id);
  return options;
}

export async function verifyRegistration(req: Request, res: Response, user: User, response: RegistrationResponseJSON, name?: string) {
  const expectedChallenge = takeChallenge(req, res, 'register', user.id);
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: false,
  }).catch(() => null);
  if (!verification?.verified) throw badRequest('Could not verify the passkey. Please try again.', 'PASSKEY_INVALID');

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const count = (await listPasskeys(user.id)).length;
  const [row] = await db
    .insert(passkeys)
    .values({
      id: credential.id,
      userId: user.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports ?? response.response.transports ?? null,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: name?.trim() || `Passkey ${count + 1}`,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) throw badRequest('This passkey is already registered', 'PASSKEY_EXISTS');
  return row;
}

// ─── Authentication ───────────────────────────────────────────────────────

export async function loginOptions(res: Response) {
  // No allowCredentials: the browser offers any discoverable passkey for this site.
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
  saveChallenge(res, 'login', options.challenge);
  return options;
}

/** Verifies an assertion and returns the passkey owner plus whether the user was verified (PIN/biometric). */
export async function verifyLogin(req: Request, res: Response, response: AuthenticationResponseJSON) {
  const expectedChallenge = takeChallenge(req, res, 'login');
  const [passkey] = await db.select().from(passkeys).where(eq(passkeys.id, response.id)).limit(1);
  if (!passkey) throw badRequest('This passkey is not registered with your account', 'PASSKEY_UNKNOWN');

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: passkey.id,
      publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
      counter: passkey.counter,
      transports: passkey.transports ?? undefined,
    },
  }).catch(() => null);
  if (!verification?.verified) throw badRequest('Passkey verification failed', 'PASSKEY_INVALID');

  await db
    .update(passkeys)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(passkeys.id, passkey.id));
  return { userId: passkey.userId, userVerified: verification.authenticationInfo.userVerified };
}

export async function renamePasskey(userId: string, id: string, name: string) {
  const [row] = await db
    .update(passkeys)
    .set({ name })
    .where(and(eq(passkeys.userId, userId), eq(passkeys.id, id)))
    .returning();
  return row;
}

export async function deletePasskey(userId: string, id: string) {
  const [row] = await db.delete(passkeys).where(and(eq(passkeys.userId, userId), eq(passkeys.id, id))).returning();
  return row;
}

export const serializePasskey = (p: Passkey) => ({
  id: p.id,
  name: p.name,
  deviceType: p.deviceType,
  backedUp: p.backedUp,
  createdAt: p.createdAt.toISOString(),
  lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
});
