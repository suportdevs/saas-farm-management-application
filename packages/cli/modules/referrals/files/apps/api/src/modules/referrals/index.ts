import { audit, currentRequest, defineModule } from '../../core';
import { router } from './routes';
import { REFERRAL_COOKIE, recordSignup } from './service';

export { referrerOf } from './service';

export default defineModule({
  name: 'referrals',
  router,
  setup({ hooks }) {
    // The web app stores ?ref=<code> in a cookie; read it from the sign-up request
    // (password, social or magic-link sign-up all pass through here).
    hooks.onUserCreated(async (user) => {
      const req = currentRequest();
      const code = req?.cookies?.[REFERRAL_COOKIE];
      if (typeof code !== 'string') return;
      await recordSignup(user, code);
      await audit(req ?? null, { action: 'referral.signup', actorId: user.id, metadata: { code } });
    });
  },
});
