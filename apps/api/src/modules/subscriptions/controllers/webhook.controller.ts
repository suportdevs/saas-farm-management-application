import type { Request, Response } from 'express';
import { logger } from '../../../core';
import { handleEvent, verifyWebhook } from '../services/subscription.service';

/** POST /api/billing/webhook — Stripe signs its requests; `req.rawBody` holds the signed bytes. */
export async function stripe(req: Request, res: Response) {
  const event = verifyWebhook(req.rawBody, req.get('stripe-signature'));
  const processed = await handleEvent(event);
  logger.info({ event: event.type, id: event.id, duplicate: !processed }, 'Stripe webhook received');
  res.json({ received: true });
}
