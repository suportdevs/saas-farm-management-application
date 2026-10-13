import { defineModule } from '../../core';
import { providers } from './providers';
import { router } from './routes';

export default defineModule({
  name: 'social-auth',
  basePath: 'oauth',
  router,
  setup({ hooks, logger }) {
    if (providers.size === 0) {
      logger.warn('No OAuth providers configured — set e.g. GOOGLE_CLIENT_ID/SECRET to enable social login');
    }
    hooks.addFeatures(() => ({ oauthProviders: [...providers.keys()] }));
  },
});
