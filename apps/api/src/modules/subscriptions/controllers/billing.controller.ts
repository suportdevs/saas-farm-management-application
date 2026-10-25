import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { checkoutSchema } from '@kit/shared';
import { audit } from '../../../core';
import { getFarm } from '../../farms';
import { manualInvoicesForTenant } from '../services/manual-billing.service';
import { billingOverview, createCheckout, createPortal, listInvoices } from '../services/subscription.service';

/** GET /:farm/billing */
export async function overview(_req: Request, res: Response) {
  res.json(await billingOverview(getFarm(res).farm));
}

/** GET /:farm/billing/invoices — invoices issued by hand (bank transfer, cash…) next to the Stripe ones, newest first. */
export async function invoices(_req: Request, res: Response) {
  const { farm } = getFarm(res);
  const [manual, stripe] = await Promise.all([manualInvoicesForTenant(farm.id), listInvoices(farm)]);
  res.json({ invoices: [...manual, ...stripe].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
}

/** POST /:farm/billing/checkout — a Stripe Checkout URL. */
export async function checkout(req: Request, res: Response) {
  const { farm } = getFarm(res);
  const { planId, interval } = req.body as z.output<typeof checkoutSchema>;
  const url = await createCheckout(farm, req.auth!.user, planId, interval);
  await audit(req, { action: 'farm.checkout_started', targetType: 'farm', targetId: farm.id, metadata: { planId, interval } });
  res.json({ url });
}

/** POST /:farm/billing/portal — a Stripe customer portal URL. */
export async function portal(_req: Request, res: Response) {
  res.json({ url: await createPortal(getFarm(res).farm) });
}
