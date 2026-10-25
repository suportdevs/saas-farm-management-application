import { and, count, desc, eq, ilike, inArray, not, or, sql, type SQL } from 'drizzle-orm';
import { monthlyValue, type AdminSubscriptionListQuery, type BillingInterval, type PlatformSubscription } from '@kit/shared';
import { db, escapeLike, users } from '../../../core';
import { farmMembers, farms } from '../../farms';
import { entitlementsOf, farmSubscriptions, getPlan, subscriptionOf, unpaidByFarm, unpaidFarmIds } from '../../subscriptions';

const s = farmSubscriptions;

/** SQL mirrors of `subscriptionOf()` (farms without a row are free). */
const entitled = sql`coalesce((coalesce(${s.plan}, 'free') <> 'free' and ${s.status} in ('active','trialing','past_due')
  and not (${s.source} = 'manual' and ${s.currentPeriodEnd} is not null and ${s.currentPeriodEnd} <= now())), false)`;
const onTrial = sql`(not ${entitled} and coalesce(${s.trialEndsAt} > now(), false))`;

const stateWhere: Record<NonNullable<AdminSubscriptionListQuery['state']>, SQL> = {
  trialing: sql`(${onTrial} or (${entitled} and ${s.status} = 'trialing'))`,
  active: sql`(${entitled} and ${s.status} = 'active')`,
  past_due: sql`(${entitled} and ${s.status} = 'past_due')`,
  canceled: sql`(not ${entitled} and not ${onTrial} and ${s.status} = 'canceled')`,
  free: sql`(not ${entitled} and not ${onTrial} and ${s.status} is distinct from 'canceled')`,
};

const owners = db
  .select({ farmId: farmMembers.farmId, id: users.id, name: users.name, email: users.email })
  .from(farmMembers)
  .innerJoin(users, eq(users.id, farmMembers.userId))
  .where(eq(farmMembers.role, 'owner'))
  .as('owner');

const memberCounts = db.select({ farmId: farmMembers.farmId, total: count().as('member_total') }).from(farmMembers).groupBy(farmMembers.farmId).as('members');

/** Every tenant's subscription, deal and unpaid manual invoices. */
export async function listSubscriptions({ page, pageSize, q, plan, state, source, billing }: AdminSubscriptionListQuery) {
  const filters: SQL[] = [];
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    filters.push(or(ilike(farms.name, pattern), ilike(farms.slug, pattern), ilike(owners.email, pattern))!);
  }
  if (plan) filters.push(plan === 'free' ? sql`not ${entitled}` : and(entitled, eq(s.plan, plan))!);
  if (state) filters.push(stateWhere[state]);
  if (source === 'none') filters.push(not(entitled));
  else if (source) filters.push(and(entitled, eq(s.source, source))!);
  if (billing) filters.push(inArray(farms.id, unpaidFarmIds(billing === 'overdue')));
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .selectDistinctOn([farms.createdAt, farms.id], {
        farm: farms,
        sub: s,
        ownerId: owners.id,
        ownerName: owners.name,
        ownerEmail: owners.email,
        members: memberCounts.total,
      })
      .from(farms)
      .leftJoin(s, eq(s.farmId, farms.id))
      .leftJoin(owners, eq(owners.farmId, farms.id))
      .leftJoin(memberCounts, eq(memberCounts.farmId, farms.id))
      .where(where)
      .orderBy(desc(farms.createdAt), farms.id)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: sql<number>`count(distinct ${farms.id})`.mapWith(Number) })
      .from(farms)
      .leftJoin(s, eq(s.farmId, farms.id))
      .leftJoin(owners, eq(owners.farmId, farms.id))
      .where(where),
  ]);
  const unpaid = await unpaidByFarm(rows.map((r) => r.farm.id));
  const subscriptions: PlatformSubscription[] = rows.map(({ farm, sub, ownerId, ownerName, ownerEmail, members }) => {
    const row = sub ?? undefined;
    const subscription = subscriptionOf(row);
    const { limits } = entitlementsOf(row);
    const paying = subscription.state === 'active' || subscription.state === 'past_due';
    return {
      farm: { id: farm.id, name: farm.name, slug: farm.slug, country: farm.country, suspended: Boolean(farm.suspendedAt) },
      owner: ownerId ? { id: ownerId, name: ownerName!, email: ownerEmail! } : null,
      subscription,
      mrr: paying ? monthlyValue(getPlan(subscription.planId), (subscription.interval as BillingInterval | null) ?? 'month') : 0,
      limits,
      hasOverrides: Object.keys(row?.limitOverrides ?? {}).length + Object.keys(row?.capabilityOverrides ?? {}).length > 0,
      unpaid: unpaid.get(farm.id) ?? { count: 0, overdue: 0, balances: [] },
      memberCount: Number(members ?? 0),
    };
  });
  return { subscriptions, pagination: { page, pageSize, total: total?.value ?? 0 } };
}
