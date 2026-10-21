import { env, renderEmail, sendMail, type User } from '../../core';
import type { Farm } from './schema';

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** `roleLabel` is the system role's label or the custom role's name. */
export function sendInvitationEmail(opts: { to: string; token: string; farm: Farm; inviter: User; roleLabel: string }) {
  const role = opts.roleLabel;
  return sendMail({
    to: opts.to,
    subject: `${opts.inviter.name} invited you to join ${opts.farm.name} on ${env.APP_NAME}`,
    ...renderEmail({
      heading: `Join ${opts.farm.name}`,
      body: [
        `${opts.inviter.name} (${opts.inviter.email}) invited you to join ${opts.farm.name} on ${env.APP_NAME} as ${article(role)} ${role.toLowerCase()}.`,
        `${env.APP_NAME} is where the team records and tracks everything happening on the farm — from the herd register to daily milk, health and breeding records.`,
      ],
      action: { label: 'Accept invitation', url: `${env.WEB_URL}/invite?token=${encodeURIComponent(opts.token)}` },
      note: "This invitation expires in 7 days. If you weren't expecting it, you can ignore this email.",
    }),
  });
}
