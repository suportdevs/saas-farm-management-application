import { defineModule } from '../../core';
import { farmExtensions } from '../farms';
import { billingEnabled, config, trialPlan } from './config';
import { assertWithinLimit, entitlementsOf, findSubscription, findSubscriptions, snapshotOf, subscriptionOf } from './entitlements';
import { scheduleTrialReminders } from './reminders';
import { router, webhookRouter } from './routes';
import { cancelFarmSubscription, startTrial } from './service';

/**
 * Subscriptions — plans, trials, limits and Stripe billing for each farm.
 * Plugs into the farms module through `farmExtensions`.
 *
 * Public API for other modules (import from '../subscriptions' only):
 */
export { assertWithinLimit, entitlementsOf, findSubscription, findSubscriptions, planOf, requireCapability, snapshotOf, subscriptionOf } from './entitlements';
export { cancelFarmSubscription, extendTrial, setManualPlan } from './service';
export {
  createManualInvoice,
  deleteManualPayment,
  entitlementsFor,
  getManualInvoice,
  listManualInvoices,
  recordManualPayment,
  setEntitlements,
  unpaidByFarm,
  unpaidFarmIds,
  voidManualInvoice,
} from './manual-billing';
export { farmSubscriptions, manualInvoices, type FarmSubscriptionRow } from './schema';

export default defineModule({
  name: 'subscriptions',
  // Farm-scoped billing routes (/api/farms/:farm/billing…); Stripe webhooks at /api/billing/webhook.
  basePath: 'farms',
  router,
  publicBasePath: 'billing',
  publicRouter: webhookRouter,
  setup({ hooks, logger }) {
    if (!billingEnabled()) logger.info('STRIPE_SECRET_KEY not set — online checkout is disabled');

    farmExtensions.onCreated((farm, tx) => startTrial(farm, tx));
    farmExtensions.onDeleting((farm) => cancelFarmSubscription(farm));
    farmExtensions.extendContext(async (farm) => snapshotOf(await findSubscription(farm.id)));
    // Module permissions follow the plan: a farm only gets the keys of modules its plan includes.
    farmExtensions.provideCapabilities(async (farmIds) => {
      const rows = await findSubscriptions(farmIds);
      return new Map(farmIds.map((id) => [id, entitlementsOf(rows.get(id)).capabilities]));
    });
    farmExtensions.extendSummaries(async (farmIds) => {
      const rows = await findSubscriptions(farmIds);
      return new Map(farmIds.map((id) => [id, { planId: subscriptionOf(rows.get(id)).planId }]));
    });
    farmExtensions.addSeatGuard((farm, seats) => assertWithinLimit(farm.id, 'members', seats));

    hooks.addFeatures(() => ({ farms: { billing: billingEnabled(), trialDays: config.FARM_TRIAL_DAYS, trialPlan } }));
    scheduleTrialReminders();
  },
});
