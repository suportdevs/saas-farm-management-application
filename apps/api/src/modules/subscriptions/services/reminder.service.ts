import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { db, defineJob, logger, schedule, users } from '../../../core';
import { farmMembers, farms, findFarm } from '../../farms';
import { sendTrialEndedEmail, sendTrialEndingEmail } from './email.service';
import { farmSubscriptions } from '../models';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const trialEmailJob = defineJob<{ farmId: string; kind: 'ending' | 'ended' }>('subscriptions.trial-email', async ({ farmId, kind }) => {
  const farm = await findFarm(farmId);
  if (!farm || farm.suspendedAt) return;
  const [sub] = await db.select().from(farmSubscriptions).where(eq(farmSubscriptions.farmId, farmId)).limit(1);
  const owners = await db
    .select({ email: users.email, name: users.name })
    .from(farmMembers)
    .innerJoin(users, eq(users.id, farmMembers.userId))
    .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.role, 'owner')));
  const daysLeft = sub?.trialEndsAt ? Math.max(1, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / DAY)) : 0;
  for (const owner of owners) {
    if (kind === 'ending') await sendTrialEndingEmail(owner.email, owner.name, farm, daysLeft);
    else await sendTrialEndedEmail(owner.email, owner.name, farm);
  }
});

/** Trials (without a paid subscription) ending inside [from, to). */
const trialsEndingBetween = (from: Date, to: Date) =>
  db
    .select({ id: farmSubscriptions.farmId, trialEndsAt: farmSubscriptions.trialEndsAt })
    .from(farmSubscriptions)
    .innerJoin(farms, eq(farms.id, farmSubscriptions.farmId))
    .where(
      and(
        gt(farmSubscriptions.trialEndsAt, from),
        lte(farmSubscriptions.trialEndsAt, to),
        isNull(farms.suspendedAt),
        sql`(${farmSubscriptions.status} is null or ${farmSubscriptions.status} not in ('active','trialing','past_due'))`,
      ),
    );

/** Hourly sweep; each farm/kind is emailed once thanks to the job's unique key. */
export function scheduleTrialReminders() {
  schedule('subscriptions.trial-reminders', HOUR, async () => {
    const now = Date.now();
    const [ending, ended] = await Promise.all([
      trialsEndingBetween(new Date(now + 2 * DAY), new Date(now + 3 * DAY)),
      trialsEndingBetween(new Date(now - DAY), new Date(now)),
    ]);
    for (const f of ending) {
      await trialEmailJob.enqueue({ farmId: f.id, kind: 'ending' }, { uniqueKey: `trial-ending:${f.id}:${f.trialEndsAt!.getTime()}` });
    }
    for (const f of ended) {
      await trialEmailJob.enqueue({ farmId: f.id, kind: 'ended' }, { uniqueKey: `trial-ended:${f.id}:${f.trialEndsAt!.getTime()}` });
    }
    if (ending.length || ended.length) logger.info({ ending: ending.length, ended: ended.length }, 'Queued trial reminder emails');
  });
}
