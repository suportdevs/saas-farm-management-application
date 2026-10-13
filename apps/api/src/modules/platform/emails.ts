import { env, renderEmail, sendMail } from '../../core';
import type { Farm } from '../farms';

export function sendFarmSuspendedEmail(to: string, name: string, farm: Farm, reason: string | null) {
  return sendMail({
    to,
    subject: `${farm.name} has been suspended`,
    ...renderEmail({
      heading: 'Your farm workspace was suspended',
      body: [
        `Hi ${name},`,
        `Access to ${farm.name} on ${env.APP_NAME} has been suspended by our team.`,
        ...(reason ? [`Reason: ${reason}`] : []),
        'Your data is safe. Reply to this email to resolve the issue and restore access.',
      ],
    }),
  });
}
