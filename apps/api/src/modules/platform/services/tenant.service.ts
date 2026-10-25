import { and, count, desc, eq, gt, ilike, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import {
  isPlanId,
  monthlyValue,
  type AdminFarmListQuery,
  type BillingInterval,
  type FarmType,
  type PlanId,
  type PlatformFarm,
  type PlatformStats,
} from '@kit/shared';
import { db, notFound, users } from '../../../core';
import { farmMembers, farms, findFarm, listActivity, listMembers, serializeFarm, type Farm } from '../../farms';
import { farmSubscriptions, findSubscription, subscriptionOf, type FarmSubscriptionRow } from '../../subscriptions';

const DAY = 24 * 60 * 60 * 1000;
const s = farmSubscriptions;

/** SQL mirror of `paidPlan()` in subscriptions/services/entitlement.service.ts (farms without a row are free). */
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

/** A tenant by id, or 404. */
export async function findTenant(id: string): Promise<Farm> {
  const farm = await findFarm(id);
  if (!farm) throw notFound('Farm not found');
  return farm;
}

/** Revenue and growth across all tenants. */
export async function platformStats(): Promise<PlatformStats> {
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
  return {
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
}

/** The farm directory: search and filter every tenant. */
export async function listTenants({ page, pageSize, q, plan, status, country }: AdminFarmListQuery) {
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
  return {
    farms: unique.map((r) =>
      serializePlatformFarm(
        r.farms,
        r.farm_subscriptions,
        r.owner ? { id: r.owner.id, name: r.owner.name, email: r.owner.email } : null,
        Number(r.members?.total ?? 0),
      ),
    ),
    pagination: { page, pageSize, total: total?.value ?? 0 },
  };
}

/** One tenant: profile, billing, team and recent activity. */
export async function tenantDetail(farm: Farm) {
  const [members, activity, sub] = await Promise.all([listMembers(farm.id), listActivity(farm.id, { limit: 20, offset: 0 }), findSubscription(farm.id)]);
  const owner = members.find((m) => m.role === 'owner');
  return {
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
  };
}
