import { defineModule } from '../../core';
import { router } from './routes';
import { listPasskeys } from './service';

export default defineModule({
  name: 'passkeys',
  router,
  setup({ hooks }) {
    hooks.addUserSerializer(async (user) => ({ passkeyCount: (await listPasskeys(user.id)).length }));
  },
});
