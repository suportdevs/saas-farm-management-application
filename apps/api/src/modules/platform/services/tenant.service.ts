import { and, count, desc, eq, gt, ilike, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import {
  monthlyValue,
  type AdminFarmListQuery,
  type AdminOrganizationListQuery,
  type BillingInterval,
  type FarmType,
  type PlanId,
  type PlatformFarm,
  type PlatformOrganization,
  type PlatformStats,
} from '@kit/shared';
import { db, escapeLike, notFound, users } from '../../../core';
import { farmMembers, farms, findFarm, findOrganization, listActivity, listMembers, organizationMembers, organizations, serializeFarm, type Farm } from '../../farms';
import { farmSubscriptions, findSubscription, getPlan, planExists, subscriptionOf, type FarmSubscriptionRow } from '../../subscriptions';

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
  organization: { id: string; name: string },
): PlatformFarm {
  return {
    id: farm.id,
    name: farm.name,
    slug: farm.slug,
    type: farm.type,
    country: farm.country,
    city: farm.city,
    organization,
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
    (sum, r) => sum + (planExists(r.plan) ? monthlyValue(getPlan(r.plan!), (r.interval as BillingInterval | null) ?? 'month') * r.count : 0),
    0,
  );
  const byDay = new Map(createdRows.map((r) => [r.day, r.count]));
  return {
    farms: totals!,
    mrr,
    byPlan: planRows.filter((r) => planExists(r.plan)).map((r) => ({ planId: r.plan as PlanId, count: r.count })),
    byCountry: countryRows,
    byType: typeRows.map((r) => ({ type: r.type as FarmType, count: r.count })),
    created: Array.from({ length: 30 }, (_, i) => {
      const date = new Date(now - (29 - i) * DAY).toISOString().slice(0, 10);
      return { date, count: byDay.get(date) ?? 0 };
    }),
  };
}

/** The farm directory: search and filter every tenant. */
export async function listTenants({ page, pageSize, q, plan, status, country, organizationId }: AdminFarmListQuery) {
  const filters: SQL[] = [];
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    filters.push(or(ilike(farms.name, pattern), ilike(farms.slug, pattern), ilike(farms.city, pattern), ilike(ownerOf.email, pattern), ilike(organizations.name, pattern))!);
  }
  if (plan) filters.push(plan === 'free' ? sql`not ${isEntitled}` : and(isEntitled, eq(s.plan, plan))!);
  if (status) filters.push(statusFilter[status]);
  if (country) filters.push(eq(farms.country, country));
  if (organizationId) filters.push(eq(farms.organizationId, organizationId));
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(farms)
      .innerJoin(organizations, eq(organizations.id, farms.organizationId))
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
      .innerJoin(organizations, eq(organizations.id, farms.organizationId))
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
        { id: r.organizations.id, name: r.organizations.name },
      ),
    ),
    pagination: { page, pageSize, total: total?.value ?? 0 },
  };
}

/** One tenant: profile, billing, team and recent activity. */
export async function tenantDetail(farm: Farm) {
  const [members, activity, sub, org] = await Promise.all([
    listMembers(farm.id),
    listActivity(farm.id, { limit: 20, offset: 0 }),
    findSubscription(farm.id),
    findOrganization(farm.organizationId),
  ]);
  const owner = members.find((m) => m.role === 'owner');
  return {
    farm: serializePlatformFarm(
      farm,
      sub,
      owner ? { id: owner.userId, name: owner.name, email: owner.email } : null,
      members.length,
      { id: farm.organizationId, name: org?.name ?? '' },
    ),
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

/** Client organizations: search by name or owner email. */
export async function listClientOrganizations({ page, pageSize, q }: AdminOrganizationListQuery) {
  const farmCounts = db.select({ organizationId: farms.organizationId, total: count().as('farm_total') }).from(farms).groupBy(farms.organizationId).as('farm_counts');
  const memberTotals = db
    .select({ organizationId: organizationMembers.organizationId, total: count().as('member_total') })
    .from(organizationMembers)
    .groupBy(organizationMembers.organizationId)
    .as('member_totals');
  const owners = db
    .selectDistinctOn([organizationMembers.organizationId], { organizationId: organizationMembers.organizationId, id: users.id, name: users.name, email: users.email })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.role, 'owner'))
    .orderBy(organizationMembers.organizationId, organizationMembers.createdAt)
    .as('org_owner');
  const where = q ? or(ilike(organizations.name, `%${escapeLike(q)}%`), ilike(owners.email, `%${escapeLike(q)}%`)) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select({ org: organizations, farms: farmCounts.total, members: memberTotals.total, ownerId: owners.id, ownerName: owners.name, ownerEmail: owners.email })
      .from(organizations)
      .leftJoin(farmCounts, eq(farmCounts.organizationId, organizations.id))
      .leftJoin(memberTotals, eq(memberTotals.organizationId, organizations.id))
      .leftJoin(owners, eq(owners.organizationId, organizations.id))
      .where(where)
      .orderBy(desc(organizations.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(organizations).leftJoin(owners, eq(owners.organizationId, organizations.id)).where(where),
  ]);
  const list: PlatformOrganization[] = rows.map((r) => ({
    id: r.org.id,
    name: r.org.name,
    farmCount: Number(r.farms ?? 0),
    memberCount: Number(r.members ?? 0),
    owner: r.ownerId ? { id: r.ownerId, name: r.ownerName!, email: r.ownerEmail! } : null,
    createdAt: r.org.createdAt.toISOString(),
  }));
  return { organizations: list, pagination: { page, pageSize, total: total?.value ?? 0 } };
}
