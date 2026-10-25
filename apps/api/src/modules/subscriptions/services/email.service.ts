import { env, renderEmail, sendMail } from '../../../core';
import type { Farm } from '../../farms';

const billingUrl = (farm: Pick<Farm, 'slug'>) => `${env.WEB_URL}/farms/${farm.slug}/billing`;

export function sendTrialEndingEmail(to: string, name: string, farm: Farm, daysLeft: number) {
  return sendMail({
    to,
    subject: `Your ${env.APP_NAME} trial for ${farm.name} ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    ...renderEmail({
      heading: 'Your free trial is ending soon',
      body: [
        `Hi ${name},`,
        `The free trial for ${farm.name} ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Choose a plan to keep every feature and your full team — your records are always kept safe.`,
      ],
      action: { label: 'Choose a plan', url: billingUrl(farm) },
      note: "If you don't pick a plan, the farm moves to the free Starter plan. Nothing is deleted.",
    }),
  });
}

export function sendTrialEndedEmail(to: string, name: string, farm: Farm) {
  return sendMail({
    to,
    subject: `Your ${env.APP_NAME} trial for ${farm.name} has ended`,
    ...renderEmail({
      heading: 'Your free trial has ended',
      body: [
        `Hi ${name},`,
        `${farm.name} is now on the free Starter plan. Upgrade at any time to unlock everything again — all of your records are still there.`,
      ],
      action: { label: 'Upgrade now', url: billingUrl(farm) },
    }),
  });
}

export function sendPaymentFailedEmail(to: string, name: string, farm: Farm, opts: { amount: string; invoiceUrl: string | null }) {
  return sendMail({
    to,
    subject: `Payment failed for ${farm.name}`,
    ...renderEmail({
      heading: "We couldn't take your payment",
      body: [
        `Hi ${name},`,
        `The payment of ${opts.amount} for ${farm.name} didn't go through. We'll retry automatically over the next few days — update your payment method to avoid losing access to paid features.`,
      ],
      action: { label: 'Update payment method', url: opts.invoiceUrl ?? billingUrl(farm) },
      note: 'Your records are safe. If payment keeps failing, the farm moves to the free Starter plan.',
    }),
  });
}
