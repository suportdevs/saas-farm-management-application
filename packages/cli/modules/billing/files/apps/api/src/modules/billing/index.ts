import { defineModule } from '../../core';
import { isConfigured } from './config';
import { router, webhookRouter } from './routes';
import { cancelAllSubscriptions, getUserPlan } from './service';

export { requirePlan } from './routes';
export { getUserPlan } from './service';

export default defineModule({
  name: 'billing',
  router,
  publicRouter: webhookRouter,
  setup({ hooks, logger }) {
    if (!isConfigured()) logger.warn('STRIPE_SECRET_KEY is not set — checkout is disabled until billing is configured');
    hooks.addUserSerializer(async (user) => {
      const plan = await getUserPlan(user.id);
      return { plan: plan.id, planName: plan.name };
    });
    hooks.onUserDeleting((user) => cancelAllSubscriptions(user.id));
    hooks.addFeatures(() => ({ billing: isConfigured() }));
  },
});
