import { Router } from 'express';
import { adminCreateUserSchema, adminUpdateUserSchema, adminUserListQuerySchema, auditLogQuerySchema, banUserSchema } from '@kit/shared';
import { requirePlatform, requireRole } from '../../../middleware/auth';
import { validate } from '../../../middleware/validate';
import * as auditLogs from '../controllers/audit-log.controller';
import * as users from '../controllers/user.controller';
import { staffRolesRouter } from './staff-role.routes';

/** Mounted at /api/admin — platform staff only, each route scoped by a staff permission. */
export const adminRouter = Router();
adminRouter.use(requireRole('admin'));
adminRouter.use('/staff-roles', staffRolesRouter);

adminRouter.get('/stats', requirePlatform('platform.stats.view'), users.stats);

adminRouter.get('/users', requirePlatform('platform.users.view'), validate(adminUserListQuerySchema, 'query'), users.list);
// Client accounts are part of onboarding a client, so they need the tenant-creation permission.
adminRouter.post('/users', requirePlatform('platform.tenants.create'), validate(adminCreateUserSchema), users.create);
adminRouter.get('/users/:id', requirePlatform('platform.users.view'), users.show);
adminRouter.patch('/users/:id', requirePlatform('platform.users.update'), validate(adminUpdateUserSchema), users.update);
adminRouter.post('/users/:id/ban', requirePlatform('platform.users.suspend'), validate(banUserSchema), users.ban);
adminRouter.post('/users/:id/unban', requirePlatform('platform.users.suspend'), users.unban);
adminRouter.delete('/users/:id/sessions', requirePlatform('platform.users.suspend'), users.revokeSessions);
adminRouter.post('/users/:id/impersonate', requirePlatform('platform.users.impersonate'), users.impersonate);
adminRouter.delete('/users/:id', requirePlatform('platform.users.delete'), users.remove);

adminRouter.get('/audit-logs', requirePlatform('platform.audit.view'), validate(auditLogQuerySchema, 'query'), auditLogs.list);
