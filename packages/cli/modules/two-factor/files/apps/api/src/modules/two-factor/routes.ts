import { Router } from 'express';
import { z } from 'zod';
import {
  authLimiter,
  badRequest,
  completeChallenge,
  requireAuth,
  requireChallenge,
  validate,
  verifyPassword,
} from '../../core';
import * as tf from './service';

export const CHALLENGE = 'two-factor';
export const router = Router();

const codeSchema = z.object({ code: z.string().trim().min(6).max(20) });
const setupSchema = z.object({ password: z.string().max(128).optional() });

router.get('/status', requireAuth, async (req, res) => {
  const userId = req.auth!.user.id;
  const row = await tf.getTwoFactor(userId);
  res.json({ enabled: Boolean(row?.enabledAt), backupCodesRemaining: row?.backupCodes.length ?? 0 });
});

/** Step 1: generate a secret + QR code. Requires the password (if the account has one). */
router.post('/setup', requireAuth, authLimiter, validate(setupSchema), async (req, res) => {
  const { user } = req.auth!;
  if (await tf.isEnabled(user.id)) throw badRequest('Two-factor authentication is already enabled', 'ALREADY_ENABLED');
  const { password } = req.body as z.infer<typeof setupSchema>;
  if (user.passwordHash && !(password && (await verifyPassword(user.passwordHash, password)))) {
    throw badRequest('Password is incorrect', 'INVALID_PASSWORD');
  }
  res.json(await tf.startSetup(user));
});

/** Step 2: confirm with a code from the authenticator app. */
router.post('/enable', requireAuth, authLimiter, validate(codeSchema), async (req, res) => {
  const { code } = req.body as z.infer<typeof codeSchema>;
  const backupCodes = await tf.enable(req.auth!.user.id, code);
  if (!backupCodes) throw badRequest('Invalid verification code', 'INVALID_CODE');
  res.json({ backupCodes });
});

router.post('/disable', requireAuth, authLimiter, validate(codeSchema), async (req, res) => {
  const { code } = req.body as z.infer<typeof codeSchema>;
  if (!(await tf.verifyCode(req.auth!.user.id, code))) throw badRequest('Invalid verification code', 'INVALID_CODE');
  await tf.disable(req.auth!.user.id);
  res.json({ ok: true });
});

router.post('/backup-codes', requireAuth, authLimiter, validate(codeSchema), async (req, res) => {
  const { code } = req.body as z.infer<typeof codeSchema>;
  if (!(await tf.verifyCode(req.auth!.user.id, code))) throw badRequest('Invalid verification code', 'INVALID_CODE');
  res.json({ backupCodes: await tf.regenerateBackupCodes(req.auth!.user.id) });
});

/** Login challenge: exchange a pending session for a full one. */
router.post('/verify', requireChallenge(CHALLENGE), authLimiter, validate(codeSchema), async (req, res) => {
  const { code } = req.body as z.infer<typeof codeSchema>;
  const method = await tf.verifyCode(req.auth!.user.id, code);
  if (!method) throw badRequest('Invalid verification code', 'INVALID_CODE');
  res.json(await completeChallenge(req, res));
});
