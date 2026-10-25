import { defineModule } from '../../core';
import { router } from './routes/platform.routes';

/**
 * Platform — the operator's console across all tenants: revenue and growth
 * stats, the farm directory, manual plans, trial extensions and suspensions.
 * Reads farms + subscriptions for reporting; changes them only through those
 * modules' public functions.
 */
export default defineModule({
  name: 'platform',
  basePath: 'admin',
  router,
});
