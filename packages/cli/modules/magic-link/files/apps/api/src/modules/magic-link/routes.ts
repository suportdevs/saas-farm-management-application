import { Router } from 'express';
import { z } from 'zod';
import { emailSchema, captchaSchema } from '@kit/shared';
import { audit, authLimiter, badRequest, limiter, requireCaptcha, signIn, validate } from '../../core';
import { consumeLink, requestLink, signupEnabled } from './service';

export const router = Router();

// Per-address limit on top of the per-IP auth limiter, so one inbox can't be flooded.
const perEmailLimiter = limiter({
  name: 'magic-link-email',
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `email:${String(req.body?.email ?? '').toLowerCase()}`,
});

const requestSchema = z.object({
  email: emailSchema,
  next: z
    .string()
    .max(500)
    .refine((v) => v.startsWith('/') && !v.startsWith('//'), 'Invalid redirect')
    .optional(),
  captcha: captchaSchema,
});

router.get('/config', (_req, res) => {
  res.json({ signup: signupEnabled() });
});

router.post('/request', authLimiter, validate(requestSchema), perEmailLimiter, requireCaptcha('magic-link'), async (req, res) => {
  const { email, next } = req.body as z.infer<typeof requestSchema>;
  await requestLink(email, next);
  res.json({ ok: true });
});

const verifySchema = z.object({ token: z.string().min(1).max(200) });
router.post('/verify', authLimiter, validate(verifySchema), async (req, res) => {
  const result = await consumeLink((req.body as z.infer<typeof verifySchema>).token);
  if (!result) throw badRequest('This sign-in link is invalid or has expired. Request a new one.', 'INVALID_TOKEN');
  const login = await signIn(req, res, result.user, { method: 'magic-link' });
  await audit(req, { action: 'auth.magic_link_used', actorId: result.user.id });
  res.json({ ...login, next: result.next });
});
