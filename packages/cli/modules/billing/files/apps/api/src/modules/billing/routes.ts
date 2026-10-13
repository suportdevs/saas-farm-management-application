import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { forbidImpersonation, forbidden, logger, requireAuth, validate } from '../../core';
import { isConfigured } from './config';
import { freePlan, publicPlans } from './plans';
import * as billing from './service';

export const router = Router();
/** Mounted before CSRF/session middleware: Stripe signs its requests instead. */
export const webhookRouter = Router();

router.get('/plans', (_req, res) => {
  res.json({ plans: publicPlans(), enabled: isConfigured() });
});

router.get('/subscription', requireAuth, async (req, res) => {
  const sub = await billing.getCurrentSubscription(req.auth!.user.id);
  const plan = await billing.getUserPlan(req.auth!.user.id);
  res.json({
    plan: { id: plan.id, name: plan.name },
    subscription: sub
      ? {
          status: sub.status,
          interval: sub.interval,
          currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          trialEnd: sub.trialEnd?.toISOString() ?? null,
        }
      : null,
    enabled: isConfigured(),
  });
});

const checkoutSchema = z.object({
  planId: z.string().min(1).max(50),
  interval: z.enum(['month', 'year']).default('month'),
});

router.post('/checkout', requireAuth, forbidImpersonation, validate(checkoutSchema), async (req, res) => {
  const { planId, interval } = req.body as z.infer<typeof checkoutSchema>;
  res.json({ url: await billing.createCheckoutSession(req.auth!.user, planId, interval) });
});

router.post('/portal', requireAuth, forbidImpersonation, async (req, res) => {
  res.json({ url: await billing.createPortalSession(req.auth!.user) });
});

webhookRouter.post('/webhook', async (req, res) => {
  const event = billing.verifyWebhook(req.rawBody, req.get('stripe-signature'));
  const processed = await billing.handleEvent(event);
  logger.info({ event: event.type, id: event.id, duplicate: !processed }, 'Stripe webhook received');
  res.json({ received: true });
});

/**
 * Gates a route to users on one of the given plans:
 *   router.get('/reports', requireAuth, requirePlan('pro', 'team'), handler)
 */
export function requirePlan(...planIds: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const plan = req.auth ? await billing.getUserPlan(req.auth.user.id) : freePlan;
    if (!planIds.includes(plan.id)) {
      throw forbidden(`This feature requires the ${planIds.join(' or ')} plan`, 'PLAN_REQUIRED');
    }
    next();
  };
}
