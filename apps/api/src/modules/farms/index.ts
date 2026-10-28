import { defineModule } from '../../core';
import { router } from './routes';
import { deleteFarm, findFarm } from './services/farm.service';
import { handleUserDeletion, leaveAllFarms } from './services/member.service';
import { handleOrgUserDeletion, leaveAllOrganizations } from './services/organization.service';

/**
 * Farms — the tenant core: organizations (clients), farms (tenants), members,
 * roles, invitations and the per-farm activity log. Knows nothing about plans
 * or billing; other modules extend it through `farmExtensions`.
 *
 *   models/       Drizzle tables (organization, farm, role, member, invitation)
 *   services/     business logic and queries
 *   controllers/  request handlers: read input → call services → audit → respond
 *   routes/       URL + middleware + controller wiring (/api/farms, /api/organizations)
 *   middleware/   requireFarm, requireOrg (tenant resolution and permission checks)
 *
 * Public API for other modules (import from '../farms' only):
 */
export { getFarm, hasPermission, requireFarm, type FarmAccess } from './middleware/farm-access.middleware';
export {
  farmInvitations,
  farmMembers,
  farmRolePermissions,
  farms,
  organizationMembers,
  organizations,
  type Farm,
  type FarmMemberRow,
  type Organization,
} from './models';
export { listActivity } from './services/activity.service';
export { farmExtensions, type Tx } from './services/farm.extensions';
export { createFarmForClient, deleteFarm, findFarm, registerUsageCounter, serializeFarm, setSuspended, usageOf } from './services/farm.service';
export { listInvitations, revokeInvitation } from './services/invitation.service';
export { listMembers, removeMember, updateMember } from './services/member.service';
export { addMemberAsPlatform, moveFarmToOrganization, platformActor, resendInvitation, transferOwnership } from './services/platform-team.service';
export { findOrganization, listOrgMembers, organizationDetail } from './services/organization.service';

export default defineModule({
  name: 'farms',
  // The router mounts /farms and /organizations itself.
  basePath: '',
  router,
  setup({ hooks }) {
    hooks.onUserDeleting(async (user) => {
      // Farms a deleted user solely owned pass to a manager, or are deleted…
      for (const farmId of await handleUserDeletion(user.id)) {
        const farm = await findFarm(farmId);
        if (farm) await deleteFarm(farm);
      }
      // …then their organizations pass to someone else, or go when empty…
      await handleOrgUserDeletion(user.id);
      // …and they leave every farm team and organization (rows kept, marked deleted).
      await leaveAllFarms(user.id);
      await leaveAllOrganizations(user.id);
    });
  },
});
