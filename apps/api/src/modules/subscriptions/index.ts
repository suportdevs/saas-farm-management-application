import { defineModule } from '../../core';
import { farmExtensions } from '../farms';
import { billingEnabled, config } from './config';
import { assertWithinLimit, entitlementsOf, findSubscription, findSubscriptions, snapshotOf, subscriptionOf } from './services/entitlement.service';
import { loadPlans, trialPlan, watchPlans } from './services/plan.service';
import { scheduleTrialReminders } from './services/reminder.service';
import { publicRouter, router } from './routes/billing.routes';
import { cancelFarmSubscription, startTrial } from './services/subscription.service';
import { markFarmBillingDeleted } from './services/manual-billing.service';

/**
 * Subscriptions — plans, trials, limits and Stripe billing for each farm.
 * Plugs into the farms module through `farmExtensions`.
 *
 * Public API for other modules (import from '../subscriptions' only):
 */
export { assertWithinLimit, entitlementsOf, findSubscription, findSubscriptions, planOf, snapshotOf, subscriptionOf } from './services/entitlement.service';
export { requireCapability } from './middleware/capability.middleware';
export { assertAssignable, cancelFarmSubscription, extendTrial, setManualPlan } from './services/subscription.service';
export {
  allPlans,
  billingSettings,
  createPlan,
  deletePlan,
  getAdminPlan,
  getPlan,
  listAdminPlans,
  planExists,
  publicPlans,
  setArchived as setPlanArchived,
  updatePlan,
} from './services/plan.service';
export {
  createManualInvoice,
  deleteManualPayment,
  entitlementsFor,
  getManualInvoice,
  listManualInvoices,
  recordManualPayment,
  recordQuickPayment,
  setEntitlements,
  unpaidByFarm,
  unpaidFarmIds,
  voidManualInvoice,
} from './services/manual-billing.service';
export { farmSubscriptions, manualInvoices, type FarmSubscriptionRow } from './models';

export default defineModule({
  name: 'subscriptions',
  // Farm-scoped billing routes (/api/farms/:farm/billing…); public plans and Stripe webhooks at /api/billing.
  basePath: 'farms',
  router,
  publicBasePath: 'billing',
  publicRouter,
  async setup({ hooks, logger }) {
    // Plans are read on every request; keep them in memory.
    await loadPlans();
    watchPlans();
    if (!billingEnabled()) logger.info('STRIPE_SECRET_KEY not set — online checkout is disabled');

    farmExtensions.onCreated((farm, tx) => startTrial(farm, tx));
    // A deleted farm: stop Stripe billing, then mark its subscription, invoices and payments deleted.
    farmExtensions.onDeleting(async (farm) => {
      await cancelFarmSubscription(farm);
      await markFarmBillingDeleted(farm.id);
    });
    farmExtensions.extendContext(async (farm) => snapshotOf(await findSubscription(farm.id)));
    // Module permissions follow the plan: a farm only gets the keys of modules its plan includes.
    farmExtensions.provideCapabilities(async (farmIds) => {
      const rows = await findSubscriptions(farmIds);
      return new Map(farmIds.map((id) => [id, entitlementsOf(rows.get(id)).capabilities]));
    });
    farmExtensions.extendSummaries(async (farmIds) => {
      const rows = await findSubscriptions(farmIds);
      return new Map(farmIds.map((id) => [id, (({ planId, planName }) => ({ planId, planName }))(subscriptionOf(rows.get(id)))]));
    });
    farmExtensions.addSeatGuard((farm, seats) => assertWithinLimit(farm.id, 'members', seats));

    hooks.addFeatures(() => ({ farms: { billing: billingEnabled(), trialDays: config.FARM_TRIAL_DAYS, trialPlan: trialPlan() } }));
    scheduleTrialReminders();
  },
});
