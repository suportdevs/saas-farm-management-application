import { defineModule } from '../../core';
import { router } from './routes';
import { handleUserDeletion } from './service';

export { getOrg, requireOrgRole, type OrgContext } from './routes';

export default defineModule({
  name: 'organizations',
  router,
  setup({ hooks }) {
    hooks.onUserDeleting((user) => handleUserDeletion(user.id));
  },
});
