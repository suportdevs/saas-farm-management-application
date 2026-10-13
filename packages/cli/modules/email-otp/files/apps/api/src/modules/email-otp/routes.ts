import { Router } from 'express';
import { z } from 'zod';
import {
  audit,
  authLimiter,
  badRequest,
  completeChallenge,
  forbidImpersonation,
  requireAuth,
  requireChallenge,
  validate,
  verifyPassword,
} from '../../core';
import { CHALLENGE, isEnabled, maskEmail, sendCode, setEnabled, verifyCode } from './service';

export const router = Router();

const passwordSchema = z.object({ password: z.string().max(128).optional() });

router.get('/status', requireAuth, async (req, res) => {
  res.json({ enabled: await isEnabled(req.auth!.user.id) });
});

async function confirmPassword(user: { passwordHash: string | null }, password?: string) {
  if (user.passwordHash && !(password && (await verifyPassword(user.passwordHash, password)))) {
    throw badRequest('Password is incorrect', 'INVALID_PASSWORD');
  }
}

router.post('/enable', requireAuth, forbidImpersonation, authLimiter, validate(passwordSchema), async (req, res) => {
  const { user } = req.auth!;
  if (!user.emailVerifiedAt) throw badRequest('Verify your email address before turning on email codes', 'EMAIL_NOT_VERIFIED');
  await confirmPassword(user, (req.body as z.infer<typeof passwordSchema>).password);
  await setEnabled(user.id, true);
  await audit(req, { action: 'email_otp.enabled' });
  res.json({ enabled: true });
});

router.post('/disable', requireAuth, forbidImpersonation, authLimiter, validate(passwordSchema), async (req, res) => {
  await confirmPassword(req.auth!.user, (req.body as z.infer<typeof passwordSchema>).password);
  await setEnabled(req.auth!.user.id, false);
  await audit(req, { action: 'email_otp.disabled' });
  res.json({ enabled: false });
});

// ─── Sign-in challenge ────────────────────────────────────────────────────

const sendSchema = z.object({ resend: z.boolean().optional() });

/** Sends the code (or reports the cooldown if one was just sent). */
router.post('/send', requireChallenge(CHALLENGE), authLimiter, validate(sendSchema), async (req, res) => {
  const { session, user } = req.auth!;
  const result = await sendCode(session.id, user, { force: (req.body as z.infer<typeof sendSchema>).resend });
  res.json({ ...result, sentTo: maskEmail(user.email) });
});

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });
router.post('/verify', requireChallenge(CHALLENGE), authLimiter, validate(codeSchema), async (req, res) => {
  await verifyCode(req.auth!.session.id, (req.body as z.infer<typeof codeSchema>).code);
  res.json(await completeChallenge(req, res));
});
