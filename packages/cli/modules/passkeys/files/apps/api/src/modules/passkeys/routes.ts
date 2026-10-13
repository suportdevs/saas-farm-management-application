import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { audit, authLimiter, badRequest, db, forbidImpersonation, notFound, requireAuth, signIn, users, validate } from '../../core';
import * as pk from './service';

export const router = Router();

// The WebAuthn JSON is validated by the library; we only check the outer shape.
const credentialSchema = z.looseObject({ id: z.string().min(1).max(1024), type: z.literal('public-key') });
const nameSchema = z.string().trim().min(1).max(100);

router.get('/', requireAuth, async (req, res) => {
  res.json({ passkeys: (await pk.listPasskeys(req.auth!.user.id)).map(pk.serializePasskey) });
});

router.post('/register/options', requireAuth, forbidImpersonation, authLimiter, async (req, res) => {
  res.json(await pk.registrationOptions(res, req.auth!.user));
});

const registerSchema = z.object({ response: credentialSchema, name: nameSchema.optional() });
router.post('/register/verify', requireAuth, forbidImpersonation, authLimiter, validate(registerSchema), async (req, res) => {
  const { response, name } = req.body as z.infer<typeof registerSchema>;
  const passkey = await pk.verifyRegistration(req, res, req.auth!.user, response as unknown as RegistrationResponseJSON, name);
  await audit(req, { action: 'passkey.added', targetType: 'passkey', targetId: passkey.id, metadata: { name: passkey.name } });
  res.status(201).json({ passkey: pk.serializePasskey(passkey) });
});

router.patch('/:id', requireAuth, forbidImpersonation, validate(z.object({ name: nameSchema })), async (req, res) => {
  const row = await pk.renamePasskey(req.auth!.user.id, String(req.params.id), (req.body as { name: string }).name);
  if (!row) throw notFound('Passkey not found');
  res.json({ passkey: pk.serializePasskey(row) });
});

router.delete('/:id', requireAuth, forbidImpersonation, async (req, res) => {
  const row = await pk.deletePasskey(req.auth!.user.id, String(req.params.id));
  if (!row) throw notFound('Passkey not found');
  await audit(req, { action: 'passkey.removed', targetType: 'passkey', targetId: row.id, metadata: { name: row.name } });
  res.status(204).end();
});

// ─── Passwordless sign-in ────────────────────────────────────────────────

router.post('/login/options', authLimiter, async (_req, res) => {
  res.json(await pk.loginOptions(res));
});

router.post('/login/verify', authLimiter, validate(z.object({ response: credentialSchema })), async (req, res) => {
  const { response } = req.body as { response: AuthenticationResponseJSON };
  const { userId, userVerified } = await pk.verifyLogin(req, res, response);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw badRequest('This passkey is not registered with your account', 'PASSKEY_UNKNOWN');
  // Only a user-verified passkey (biometric/PIN) counts as multi-factor and skips 2FA.
  res.json(await signIn(req, res, user, { method: userVerified ? 'passkey' : 'passkey:presence' }));
});
