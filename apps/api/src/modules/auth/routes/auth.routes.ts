import { Router } from 'express';
import { confirmEmailChangeSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, verifyEmailSchema } from '@kit/shared';
import { requireCaptcha } from '../../../core/captcha';
import { requireAuth } from '../../../middleware/auth';
import { authLimiter } from '../../../middleware/rate-limit';
import { validate } from '../../../middleware/validate';
import * as auth from '../controllers/auth.controller';
import * as sessions from '../controllers/session.controller';

/** Mounted at /api/auth. */
export const authRouter = Router();

authRouter.get('/captcha', authLimiter, auth.captcha);
authRouter.post('/register', authLimiter, validate(registerSchema), requireCaptcha('register'), auth.register);
authRouter.post('/login', authLimiter, validate(loginSchema), requireCaptcha('login'), auth.login);
authRouter.post('/logout', auth.logout);
authRouter.get('/session', auth.session);
authRouter.get('/me', requireAuth, auth.me);

authRouter.post('/verify-email', authLimiter, validate(verifyEmailSchema), auth.verifyEmail);
authRouter.post('/verify-email/resend', requireAuth, authLimiter, auth.resendVerification);
authRouter.post('/confirm-email-change', authLimiter, validate(confirmEmailChangeSchema), auth.confirmEmailChange);
authRouter.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), requireCaptcha('forgot-password'), auth.forgotPassword);
authRouter.post('/reset-password', authLimiter, validate(resetPasswordSchema), auth.resetPassword);
authRouter.post('/impersonation/stop', requireAuth, auth.stopImpersonation);

authRouter.get('/sessions', requireAuth, sessions.list);
authRouter.delete('/sessions', requireAuth, sessions.revokeOthers);
authRouter.delete('/sessions/:id', requireAuth, sessions.revoke);
