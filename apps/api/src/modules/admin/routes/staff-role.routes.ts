import { Router } from 'express';
import { createPlatformRoleSchema, staffRoleImportSchema, updatePlatformRoleSchema } from '@kit/shared';
import { requirePlatform } from '../../../middleware/auth';
import { validate } from '../../../middleware/validate';
import * as staffRoles from '../controllers/staff-role.controller';

/** Platform staff roles, mounted at /api/admin/staff-roles. Built-in roles are read-only. */
export const staffRolesRouter = Router();
staffRolesRouter.use(requirePlatform('platform.staff.manage'));

staffRolesRouter.get('/', staffRoles.list);
staffRolesRouter.post('/', validate(createPlatformRoleSchema), staffRoles.create);
staffRolesRouter.post('/import', validate(staffRoleImportSchema), staffRoles.importRoles);
staffRolesRouter.get('/:key', staffRoles.show);
staffRolesRouter.patch('/:key', validate(updatePlatformRoleSchema), staffRoles.update);
staffRolesRouter.delete('/:key', staffRoles.remove);
