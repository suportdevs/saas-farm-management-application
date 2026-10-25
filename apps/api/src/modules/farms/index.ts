import { defineModule } from '../../core';
import { router } from './routes/farm.routes';
import { deleteFarm, findFarm } from './services/farm.service';
import { handleUserDeletion } from './services/member.service';

/**
 * Farms — the tenant core: farms, members, roles, invitations and the
 * per-farm activity log. Knows nothing about plans or billing; other modules
 * extend it through `farmExtensions`.
 *
 *   models/       Drizzle tables (farm, role, member, invitation)
 *   services/     business logic and queries
 *   controllers/  request handlers: read input → call services → audit → respond
 *   routes/       URL + middleware + controller wiring
 *   middleware/   requireFarm (tenant resolution and permission checks)
 *
 * Public API for other modules (import from '../farms' only):
 */
export { getFarm, hasPermission, requireFarm, type FarmAccess } from './middleware/farm-access.middleware';
export { farmInvitations, farmMembers, farmRolePermissions, farms, type Farm, type FarmMemberRow } from './models';
export { listActivity } from './services/activity.service';
export { farmExtensions, type Tx } from './services/farm.extensions';
export { createFarmForClient, deleteFarm, findFarm, registerUsageCounter, serializeFarm, setSuspended, usageOf } from './services/farm.service';
export { listMembers } from './services/member.service';

export default defineModule({
  name: 'farms',
  router,
  setup({ hooks }) {
    // Farms a deleted user solely owned pass to a manager, or are deleted.
    hooks.onUserDeleting(async (user) => {
      for (const farmId of await handleUserDeletion(user.id)) {
        const farm = await findFarm(farmId);
        if (farm) await deleteFarm(farm);
      }
    });
  },
});
