import { defineModule } from '../../core';
import { router } from './routes';
import { deleteFarm, findFarm, handleUserDeletion } from './service';

/**
 * Farms — the tenant core: farms, members, roles, invitations and the
 * per-farm activity log. Knows nothing about plans or billing; other modules
 * extend it through `farmExtensions`.
 *
 * Public API for other modules (import from '../farms' only):
 */
export { getFarm, requireFarm, type FarmAccess } from './access';
export { farmExtensions, type Tx } from './extensions';
export { farmInvitations, farmMembers, farms, type Farm, type FarmMemberRow } from './schema';
export {
  deleteFarm,
  findFarm,
  listActivity,
  listMembers,
  registerUsageCounter,
  serializeFarm,
  setSuspended,
  usageOf,
} from './service';

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
