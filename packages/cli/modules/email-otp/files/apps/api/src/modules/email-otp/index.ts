import { defineModule } from '../../core';
import { router } from './routes';
import { CHALLENGE, isEnabled } from './service';

export default defineModule({
  name: 'email-otp',
  router,
  setup({ hooks }) {
    // Passkey sign-ins already prove two factors; everything else gets an emailed code.
    hooks.addLoginGuard(async ({ user, method }) => (method !== 'passkey' && (await isEnabled(user.id)) ? CHALLENGE : null));
    hooks.addUserSerializer(async (user) => ({ emailOtpEnabled: await isEnabled(user.id) }));
  },
});
