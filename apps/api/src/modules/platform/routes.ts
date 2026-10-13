import { Router, type Request } from 'express';
import { and, count, desc, eq, gt, ilike, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  adminExtendTrialSchema,
  adminFarmListQuerySchema,
  adminSetPlanSchema,
  adminSuspendFarmSchema,
  isPlanId,
  monthlyValue,
  type AdminFarmListQuery,
  type AdminSetPlanInput,
  type BillingInterval,
  type FarmType,
  type PlanId,
  type PlatformFarm,
  type PlatformStats,
} from '@kit/shared';
import { audit, db, notFound, requireRole, users, validate } from '../../core';
import { deleteFarm, farmMembers, farms, findFarm, listActivity, listMembers, serializeFarm, setSuspended, type Farm } from '../farms';
import { extendTrial, farmSubscriptions, findSubscription, setManualPlan, subscriptionOf, type FarmSubscriptionRow } from '../subscriptions';
import { sendFarmSuspendedEmail } from './emails';

/** Mounted at /api/admin/farms. */
export const router = Router();
router.use(requireRole('admin'));

const DAY = 24 * 60 * 60 * 1000;
const s = farmSubscriptions;

/** SQL mirror of `paidPlan()` in subscriptions/entitlements.ts (farms without a row are free). */
const entitled = sql`(coalesce(${s.plan}, 'free') <> 'free' and ${s.status} in ('active','trialing','past_due')
  and not (${s.source} = 'manual' and ${s.currentPeriodEnd} is not null and ${s.currentPeriodEnd} <= now()))`;
const onTrial = sql`(not coalesce(${entitled}, false) and ${s.trialEndsAt} > now())`;
const isEntitled = sql`coalesce(${entitled}, false)`;

const statusFilter: Record<NonNullable<AdminFarmListQuery['status']>, SQL> = {
  paying: isEntitled,
  trialing: onTrial,
  past_due: sql`${isEntitled} and ${s.status} = 'past_due'`,
  free: sql`(not ${isEntitled} and (${s.trialEndsAt} is null or ${s.trialEndsAt} <= now()))`,
  suspended: isNotNull(farms.suspendedAt),
};

const ownerOf = db
  .select({ farmId: farmMembers.farmId, id: users.id, name: users.name, email: users.email })
  .from(farmMembers)
  .innerJoin(users, eq(users.id, farmMembers.userId))
  .where(eq(farmMembers.role, 'owner'))
  .as('owner');

const memberCounts = db
  .select({ farmId: farmMembers.farmId, total: count().as('total') })
  .from(farmMembers)
  .groupBy(farmMembers.farmId)
  .as('members');

function serializePlatformFarm(
  farm: Farm,
  sub: FarmSubscriptionRow | undefined | null,
  owner: { id: string; name: string; email: string } | null,
  memberCount: number,
): PlatformFarm {
  return {
    id: farm.id,
    name: farm.name,
    slug: farm.slug,
    type: farm.type,
    country: farm.country,
    city: farm.city,
    subscription: subscriptionOf(sub ?? undefined),
    memberCount,
    owner,
    suspendedAt: farm.suspendedAt?.toISOString() ?? null,
    suspendedReason: farm.suspendedReason,
    createdAt: farm.createdAt.toISOString(),
  };
}

router.get('/stats', async (_req, res) => {
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY);
  const [[totals], planRows, revenueRows, countryRows, typeRows, createdRows] = await Promise.all([
    db
      .select({
        total: count(),
        new7d: sql<number>`count(*) filter (where ${farms.createdAt} > ${new Date(now - 7 * DAY).toISOString()})`.mapWith(Number),
        new30d: sql<number>`count(*) filter (where ${farms.createdAt} > ${since30.toISOString()})`.mapWith(Number),
        trialing: sql<number>`count(*) filter (where ${onTrial})`.mapWith(Number),
        paying: sql<number>`count(*) filter (where ${isEntitled})`.mapWith(Number),
        pastDue: sql<number>`count(*) filter (where ${isEntitled} and ${s.status} = 'past_due')`.mapWith(Number),
        suspended: count(farms.suspendedAt),
      })
      .from(farms)
      .leftJoin(s, eq(s.farmId, farms.id)),
    db
      .select({ plan: sql<string>`case when ${isEntitled} then ${s.plan} else 'free' end`, count: count() })
      .from(farms)
      .leftJoin(s, eq(s.farmId, farms.id))
      .groupBy(sql`1`),
    db
      .select({ plan: s.plan, interval: s.interval, count: count() })
      .from(s)
      .where(and(isEntitled, sql`${s.status} in ('active','past_due')`))
      .groupBy(s.plan, s.interval),
    db.select({ country: farms.country, count: count() }).from(farms).groupBy(farms.country).orderBy(desc(count())).limit(10),
    db.select({ type: farms.type, count: count() }).from(farms).groupBy(farms.type).orderBy(desc(count())),
    db
      .select({ day: sql<string>`to_char(date_trunc('day', ${farms.createdAt}), 'YYYY-MM-DD')`, count: count() })
      .from(farms)
      .where(gt(farms.createdAt, since30))
      .groupBy(sql`1`),
  ]);

  const mrr = revenueRows.reduce(
    (sum, r) => sum + (isPlanId(r.plan) ? monthlyValue(r.plan, (r.interval as BillingInterval | null) ?? 'month') * r.count : 0),
    0,
  );
  const byDay = new Map(createdRows.map((r) => [r.day, r.count]));
  const stats: PlatformStats = {
    farms: totals!,
    mrr,
    byPlan: planRows.filter((r) => isPlanId(r.plan)).map((r) => ({ planId: r.plan as PlanId, count: r.count })),
    byCountry: countryRows,
    byType: typeRows.map((r) => ({ type: r.type as FarmType, count: r.count })),
    created: Array.from({ length: 30 }, (_, i) => {
      const date = new Date(now - (29 - i) * DAY).toISOString().slice(0, 10);
      return { date, count: byDay.get(date) ?? 0 };
    }),
  };
  res.json(stats);
});

router.get('/', validate(adminFarmListQuerySchema, 'query'), async (req, res) => {
  const { page, pageSize, q, plan, status, country } = req.query as unknown as AdminFarmListQuery;
  const filters: SQL[] = [];
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    filters.push(or(ilike(farms.name, pattern), ilike(farms.slug, pattern), ilike(farms.city, pattern), ilike(ownerOf.email, pattern))!);
  }
  if (plan) filters.push(plan === 'free' ? sql`not ${isEntitled}` : and(isEntitled, eq(s.plan, plan))!);
  if (status) filters.push(statusFilter[status]);
  if (country) filters.push(eq(farms.country, country));
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(farms)
      .leftJoin(s, eq(s.farmId, farms.id))
      .leftJoin(ownerOf, eq(ownerOf.farmId, farms.id))
      .leftJoin(memberCounts, eq(memberCounts.farmId, farms.id))
      .where(where)
      .orderBy(desc(farms.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: sql<number>`count(distinct ${farms.id})`.mapWith(Number) })
      .from(farms)
      .leftJoin(s, eq(s.farmId, farms.id))
      .leftJoin(ownerOf, eq(ownerOf.farmId, farms.id))
      .where(where),
  ]);
  // A farm with several owners appears once (first owner wins).
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.farms.id) ? false : (seen.add(r.farms.id), true)));
  res.json({
    farms: unique.map((r) =>
      serializePlatformFarm(
        r.farms,
        r.farm_subscriptions,
        r.owner ? { id: r.owner.id, name: r.owner.name, email: r.owner.email } : null,
        Number(r.members?.total ?? 0),
      ),
    ),
    pagination: { page, pageSize, total: total?.value ?? 0 },
  });
});

async function loadFarm(req: Request): Promise<Farm> {
  const farm = await findFarm(String(req.params.id));
  if (!farm) throw notFound('Farm not found');
  return farm;
}

const event = (farm: Farm) => ({ targetType: 'farm', targetId: farm.id });

router.get('/:id', async (req, res) => {
  const farm = await loadFarm(req);
  const [members, activity, sub] = await Promise.all([listMembers(farm.id), listActivity(farm.id, { limit: 20, offset: 0 }), findSubscription(farm.id)]);
  const owner = members.find((m) => m.role === 'owner');
  res.json({
    farm: serializePlatformFarm(farm, sub, owner ? { id: owner.userId, name: owner.name, email: owner.email } : null, members.length),
    profile: serializeFarm(farm),
    billing: {
      plan: sub?.plan ?? 'free',
      status: sub?.status ?? null,
      source: sub?.source ?? null,
      stripeCustomerId: sub?.stripeCustomerId ?? null,
      stripeSubscriptionId: sub?.stripeSubscriptionId ?? null,
    },
    members,
    activity: activity.entries,
  });
});

/** Manual plan assignment (enterprise deals, invoiced customers, comps). */
router.patch('/:id/plan', validate(adminSetPlanSchema), async (req, res) => {
  const farm = await loadFarm(req);
  const { planId, currentPeriodEnd } = req.body as AdminSetPlanInput;
  const from = subscriptionOf(await findSubscription(farm.id)).planId;
  await setManualPlan(farm, planId, currentPeriodEnd ? new Date(currentPeriodEnd) : null);
  await audit(req, { action: 'admin.farm.plan_changed', ...event(farm), metadata: { from, to: planId, currentPeriodEnd } });
  res.status(204).end();
});

router.post('/:id/trial', validate(adminExtendTrialSchema), async (req, res) => {
  const farm = await loadFarm(req);
  const { days } = req.body as z.infer<typeof adminExtendTrialSchema>;
  const trialEndsAt = await extendTrial(farm.id, days);
  await audit(req, { action: 'admin.farm.trial_extended', ...event(farm), metadata: { days, trialEndsAt: trialEndsAt.toISOString() } });
  res.status(204).end();
});

router.post('/:id/suspend', validate(adminSuspendFarmSchema), async (req, res) => {
  const farm = await loadFarm(req);
  const { reason } = req.body as z.infer<typeof adminSuspendFarmSchema>;
  await setSuspended(farm.id, reason || null);
  const owners = (await listMembers(farm.id)).filter((m) => m.role === 'owner');
  await Promise.all(owners.map((o) => sendFarmSuspendedEmail(o.email, o.name, farm, reason || null)));
  await audit(req, { action: 'admin.farm.suspended', ...event(farm), metadata: { reason } });
  res.status(204).end();
});

router.post('/:id/unsuspend', async (req, res) => {
  const farm = await loadFarm(req);
  await setSuspended(farm.id, null, false);
  await audit(req, { action: 'admin.farm.unsuspended', ...event(farm) });
  res.status(204).end();
});

router.delete('/:id', async (req, res) => {
  const farm = await loadFarm(req);
  await deleteFarm(farm);
  await audit(req, { action: 'admin.farm.deleted', ...event(farm), metadata: { name: farm.name } });
  res.status(204).end();
});
