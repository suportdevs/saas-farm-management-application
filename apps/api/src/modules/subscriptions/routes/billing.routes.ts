import { Router } from 'express';
import { z } from 'zod';
import { checkoutSchema } from '@kit/shared';
import { audit, forbidImpersonation, logger, validate } from '../../core';
import { getFarm, requireFarm } from '../farms';
import { manualInvoicesForTenant } from './manual-billing';
import { billingOverview, createCheckout, createPortal, handleEvent, listInvoices, verifyWebhook } from './service';

/** Mounted at /api/farms — farm-scoped billing lives at /api/farms/:farm/billing. */
export const router = Router();

router.get('/:farm/billing', requireFarm('billing.view', { allowSuspended: true }), async (_req, res) => {
  res.json(await billingOverview(getFarm(res).farm));
});

router.get('/:farm/billing/invoices', requireFarm('billing.view', { allowSuspended: true }), async (_req, res) => {
  const { farm } = getFarm(res);
  // Invoices issued by hand (bank transfer, cash…) next to the Stripe ones, newest first.
  const [manual, stripe] = await Promise.all([manualInvoicesForTenant(farm.id), listInvoices(farm)]);
  res.json({ invoices: [...manual, ...stripe].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

router.post(
  '/:farm/billing/checkout',
  requireFarm('billing.manage', { allowSuspended: true }),
  forbidImpersonation,
  validate(checkoutSchema),
  async (req, res) => {
    const { farm } = getFarm(res);
    const { planId, interval } = req.body as z.output<typeof checkoutSchema>;
    const url = await createCheckout(farm, req.auth!.user, planId, interval);
    await audit(req, { action: 'farm.checkout_started', targetType: 'farm', targetId: farm.id, metadata: { planId, interval } });
    res.json({ url });
  },
);

router.post('/:farm/billing/portal', requireFarm('billing.manage', { allowSuspended: true }), forbidImpersonation, async (_req, res) => {
  res.json({ url: await createPortal(getFarm(res).farm) });
});

/** Mounted at /api/billing before CSRF/session middleware: Stripe signs its requests instead. */
export const webhookRouter = Router();

webhookRouter.post('/webhook', async (req, res) => {
  const event = verifyWebhook(req.rawBody, req.get('stripe-signature'));
  const processed = await handleEvent(event);
  logger.info({ event: event.type, id: event.id, duplicate: !processed }, 'Stripe webhook received');
  res.json({ received: true });
});
