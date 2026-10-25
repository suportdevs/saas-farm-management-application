import { Router } from 'express';
import { changeEmailSchema, changePasswordSchema, deleteAccountSchema, updateProfileSchema } from '@kit/shared';
import { forbidImpersonation, requireAuth } from '../../../middleware/auth';
import { authLimiter } from '../../../middleware/rate-limit';
import { validate } from '../../../middleware/validate';
import * as profile from '../controllers/profile.controller';
import { activityQuery } from '../validators/activity.validator';

/** Mounted at /api/users — the signed-in user's own account. */
export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.patch('/me', validate(updateProfileSchema), profile.update);
usersRouter.post('/me/password', forbidImpersonation, authLimiter, validate(changePasswordSchema), profile.changePassword);
usersRouter.post('/me/email', forbidImpersonation, authLimiter, validate(changeEmailSchema), profile.changeEmail);
usersRouter.get('/me/activity', validate(activityQuery, 'query'), profile.activity);
usersRouter.delete('/me', forbidImpersonation, authLimiter, validate(deleteAccountSchema), profile.remove);
