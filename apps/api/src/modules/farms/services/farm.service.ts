import { and, asc, count, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import {
  cleanOverrides,
  FARM_ROLES,
  gatePermissions,
  moduleStatuses,
  resolvePermissions,
  rolePermissions,
  TOGGLEABLE_MODULES,
  type CreateFarmData,
  type FarmContext,
  type FarmProfile,
  type FarmSummary,
  type FarmUsage,
  type OrgRole,
  type UnitSystem,
} from '@kit/shared';
import { badRequest, conflict, db, forbidden, isUuid, notDeleted, notFound, randomToken, softDeleted, users, type User } from '../../../core';
import { config } from '../config';
import { farmCustomRoles, farmInvitations, farmMembers, farmRolePermissions, farms, organizationMembers, organizations, type Farm, type FarmMemberRow } from '../models';
import { farmExtensions } from './farm.extensions';
import { inviteOwner, seatCount } from './invitation.service';
import { addMember, effectiveMember } from './member.service';
import { createClientOrganization, findOrganization, organizationForNewFarm } from './organization.service';
import { gateOf, roleOverridesOf } from './permission.service';
import { customRoleRef, listCustomRoles } from './role.service';

/** Slugs that would collide with app routes. */
export const RESERVED_SLUGS = new Set(['new', 'invitations', 'settings', 'api', 'admin', 'billing', 'onboarding']);

// ─── Serialisation ───────────────────────────────────────────────

export const serializeFarm = (farm: Farm): FarmProfile => ({
  id: farm.id,
  name: farm.name,
  slug: farm.slug,
  type: farm.type,
  description: farm.description,
  country: farm.country,
  region: farm.region,
  city: farm.city,
  address: farm.address,
  postalCode: farm.postalCode,
  timezone: farm.timezone,
  currency: farm.currency,
  locale: farm.locale,
  unitSystem: farm.unitSystem as UnitSystem,
  milkUnit: farm.milkUnit as FarmProfile['milkUnit'],
  weightUnit: farm.weightUnit as FarmProfile['weightUnit'],
  areaUnit: farm.areaUnit as FarmProfile['areaUnit'],
  totalArea: farm.totalArea,
  herdSize: farm.herdSize,
  phone: farm.phone,
  email: farm.email,
  website: farm.website,
  registrationNumber: farm.registrationNumber,
  taxId: farm.taxId,
  fiscalYearStartMonth: farm.fiscalYearStartMonth,
  goals: farm.goals,
  disabledModules: TOGGLEABLE_MODULES.filter((m) => farm.disabledModules.includes(m)),
  suspendedAt: farm.suspendedAt?.toISOString() ?? null,
  suspendedReason: farm.suspendedReason,
  createdAt: farm.createdAt.toISOString(),
});

// ─── Usage counters ──────────────────────────────────────────────

type Counter = (farmId: string) => Promise<number>;
const usageCounters: Partial<Record<keyof FarmUsage, Counter>> = {};

/**
 * Operation modules report their usage here so plan limits and the billing
 * page stay accurate, e.g. `registerUsageCounter('animals', countActiveAnimals)`.
 */
export function registerUsageCounter(resource: keyof FarmUsage, counter: Counter) {
  usageCounters[resource] = counter;
}

export async function usageOf(farmId: string): Promise<FarmUsage> {
  const [members, animals] = await Promise.all([seatCount(farmId), usageCounters.animals?.(farmId) ?? Promise.resolve(0)]);
  return { members, animals };
}

/** The farm workspace: the core fields plus whatever other modules contribute (e.g. the plan). */
export async function contextOf(
  farm: Farm,
  member: Pick<FarmMemberRow, 'role' | 'title' | 'permissionOverrides' | 'customRoleId'>,
  orgRole: OrgRole | null,
): Promise<FarmContext> {
  const [usage, extra, roleOverrides, gate, customRoles, org] = await Promise.all([
    usageOf(farm.id),
    farmExtensions.context(farm),
    roleOverridesOf(farm.id),
    gateOf(farm),
    listCustomRoles(farm.id),
    findOrganization(farm.organizationId),
  ]);
  const customRole = (member.customRoleId && customRoles.find((r) => r.id === member.customRoleId)) || null;
  const permissions = resolvePermissions(member.role, {
    roleOverrides: roleOverrides[member.role],
    memberOverrides: cleanOverrides(member.permissionOverrides),
    customRole: customRole?.permissions,
  });
  return {
    ...extra,
    farm: serializeFarm(farm),
    organization: { id: farm.organizationId, name: org?.name ?? '', role: orgRole },
    membership: { role: member.role, customRole: customRoleRef(customRole), title: member.title, permissions: gatePermissions(permissions, gate) },
    // Role settings as configured (not plan-gated), so they survive plan changes.
    rolePermissions: Object.fromEntries(FARM_ROLES.map((r) => [r, rolePermissions(r, roleOverrides[r])])),
    customRoles,
    modules: moduleStatuses(gate),
    usage,
  } as FarmContext;
}

// ─── Farms ───────────────────────────────────────────────────────

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base.length >= 3 && !RESERVED_SLUGS.has(base) ? base : `${base || 'farm'}-farm`;
}

async function slugTaken(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: farms.id })
    .from(farms)
    .where(and(eq(farms.slug, slug), notDeleted(farms)))
    .limit(1);
  return Boolean(row);
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 6; i++) {
    const candidate = i === 0 ? base : `${base}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4)}`;
    if (!(await slugTaken(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Farms the user can open: their farm teams, plus every farm of an organization they own or run. */
export async function listUserFarms(userId: string): Promise<FarmSummary[]> {
  const memberCount = db
    .select({ farmId: farmMembers.farmId, total: count().as('total') })
    .from(farmMembers)
    .where(notDeleted(farmMembers))
    .groupBy(farmMembers.farmId)
    .as('member_count');
  const rows = await db
    .select({ farm: farms, member: farmMembers, orgRole: organizationMembers.role, orgName: organizations.name, members: memberCount.total })
    .from(farms)
    .innerJoin(organizations, eq(organizations.id, farms.organizationId))
    .leftJoin(farmMembers, and(eq(farmMembers.farmId, farms.id), eq(farmMembers.userId, userId), notDeleted(farmMembers)))
    .leftJoin(
      organizationMembers,
      and(
        eq(organizationMembers.organizationId, farms.organizationId),
        eq(organizationMembers.userId, userId),
        inArray(organizationMembers.role, ['owner', 'admin']),
        notDeleted(organizationMembers),
      ),
    )
    .leftJoin(memberCount, eq(memberCount.farmId, farms.id))
    .where(and(notDeleted(farms), or(isNotNull(farmMembers.userId), isNotNull(organizationMembers.userId))))
    .orderBy(sql`${farmMembers.lastAccessedAt} desc nulls last`, asc(farms.name));

  const ids = rows.map((r) => r.farm.id);
  const customRoleIds = rows.map((r) => r.member?.customRoleId).filter((id): id is string => Boolean(id));
  const [extra, capabilities, roleRows, customRoles] = await Promise.all([
    farmExtensions.summaries(ids),
    farmExtensions.capabilities(ids),
    ids.length ? db.select().from(farmRolePermissions).where(and(inArray(farmRolePermissions.farmId, ids), notDeleted(farmRolePermissions))) : [],
    customRoleIds.length ? db.select().from(farmCustomRoles).where(inArray(farmCustomRoles.id, customRoleIds)) : [],
  ]);
  const roleOverrides = (farmId: string, role: string) => roleRows.find((r) => r.farmId === farmId && r.role === role)?.overrides;

  return rows.map(({ farm, member: teamRow, orgRole, orgName, members }) => {
    const member = effectiveMember(farm.id, userId, teamRow, orgRole)!;
    const customRole = member.customRoleId ? customRoles.find((r) => r.id === member.customRoleId) : undefined;
    const gate = { capabilities: capabilities(farm.id), disabledModules: farm.disabledModules };
    const permissions = resolvePermissions(member.role, {
      roleOverrides: cleanOverrides(roleOverrides(farm.id, member.role)),
      memberOverrides: cleanOverrides(member.permissionOverrides),
      customRole: customRole?.permissions,
    });
    return {
      ...extra(farm.id),
      id: farm.id,
      name: farm.name,
      slug: farm.slug,
      type: farm.type,
      country: farm.country,
      organization: { id: farm.organizationId, name: orgName },
      role: member.role,
      customRole: customRoleRef(customRole),
      memberCount: Number(members ?? 0),
      suspended: Boolean(farm.suspendedAt),
      permissions: gatePermissions(permissions, gate),
      modules: moduleStatuses(gate),
    };
  }) as FarmSummary[];
}

export async function createFarm(user: User, input: CreateFarmData) {
  const [owned] = await db
    .select({ value: count() })
    .from(farmMembers)
    .where(and(eq(farmMembers.userId, user.id), eq(farmMembers.role, 'owner'), notDeleted(farmMembers)));
  if ((owned?.value ?? 0) >= config.FARM_MAX_OWNED) {
    throw forbidden(`You can own up to ${config.FARM_MAX_OWNED} farms. Contact us to raise this limit.`, 'FARM_LIMIT');
  }
  const slug = await uniqueSlug(input.name);
  return db.transaction(async (tx) => {
    const org = await organizationForNewFarm(user, input.organizationId, input.name, tx);
    const [farm] = await tx.insert(farms).values({ ...farmValues(input, slug, user.id), organizationId: org.id }).returning();
    await addMember(tx, { farmId: farm!.id, userId: user.id, role: 'owner', lastAccessedAt: new Date() });
    await farmExtensions.created(farm!, tx);
    return farm!;
  });
}

const farmValues = (input: CreateFarmData, slug: string, createdById: string) => ({
  name: input.name,
  slug,
  type: input.type,
  country: input.country,
  region: input.region ?? null,
  city: input.city ?? null,
  timezone: input.timezone,
  currency: input.currency,
  locale: input.locale,
  unitSystem: input.unitSystem,
  milkUnit: input.milkUnit,
  weightUnit: input.weightUnit,
  areaUnit: input.areaUnit,
  totalArea: input.totalArea ?? null,
  herdSize: input.herdSize === null || input.herdSize === undefined ? null : Math.round(input.herdSize),
  goals: input.goals,
  createdById,
});

/**
 * A tenant created by the platform team for a client. The owner joins at once
 * when they already have an account; otherwise they get an owner invitation by
 * email (the farm has no members until they accept). Farm-owning limits don't apply.
 */
export async function createFarmForClient(staff: User, input: CreateFarmData & { ownerEmail: string; organizationName?: string }) {
  const owner = await db.query.users.findFirst({ where: and(eq(users.email, input.ownerEmail), notDeleted(users)) });
  const existingOrg = input.organizationId ? await findOrganization(input.organizationId) : undefined;
  if (input.organizationId && !existingOrg) throw notFound('Organization not found', 'ORGANIZATION_NOT_FOUND');
  const slug = await uniqueSlug(input.name);
  const farm = await db.transaction(async (tx) => {
    // A new client gets a new organization; the owner joins it now, or when they accept the invitation.
    const org = existingOrg ?? (await createClientOrganization(staff, input.organizationName || input.name, owner ?? null, tx));
    const [farm] = await tx.insert(farms).values({ ...farmValues(input, slug, staff.id), organizationId: org.id }).returning();
    if (owner) await addMember(tx, { farmId: farm!.id, userId: owner.id, role: 'owner', title: 'Farm owner' });
    await farmExtensions.created(farm!, tx);
    return farm!;
  });
  if (!owner) await inviteOwner(farm, input.ownerEmail, staff);
  return { farm, owner: owner ?? null, invited: !owner };
}

export async function findFarm(id: string) {
  if (!isUuid(id)) return undefined;
  const [farm] = await db
    .select()
    .from(farms)
    .where(and(eq(farms.id, id), notDeleted(farms)))
    .limit(1);
  return farm;
}

export async function updateFarm(farm: Farm, patch: Partial<typeof farms.$inferInsert>) {
  if (patch.slug && patch.slug !== farm.slug) {
    if (RESERVED_SLUGS.has(patch.slug)) throw badRequest('That address is reserved', 'SLUG_RESERVED');
    if (await slugTaken(patch.slug)) throw conflict('That address is already taken', 'SLUG_TAKEN');
  }
  if (typeof patch.herdSize === 'number') patch.herdSize = Math.round(patch.herdSize);
  const [updated] = await db.update(farms).set(patch).where(eq(farms.id, farm.id)).returning();
  return updated!;
}

/**
 * Deletes a farm (soft): the farm and its team, invitations and roles are marked
 * deleted together, with the same time. Other modules handle their own rows first
 * (cancel billing, mark their data deleted) through farmExtensions.onDeleting.
 */
export async function deleteFarm(farm: Farm) {
  await farmExtensions.deleting(farm);
  const deleted = softDeleted();
  await db.transaction(async (tx) => {
    for (const table of [farmMembers, farmInvitations, farmCustomRoles, farmRolePermissions]) {
      await tx.update(table).set(deleted).where(and(eq(table.farmId, farm.id), notDeleted(table)));
    }
    await tx.update(farms).set(deleted).where(eq(farms.id, farm.id));
  });
}

/** Suspends (reason) or restores (null) a farm. Suspended farms are read-blocked in requireFarm. */
export async function setSuspended(farmId: string, reason: string | null, suspended = true) {
  const [farm] = await db
    .update(farms)
    .set(suspended ? { suspendedAt: new Date(), suspendedReason: reason } : { suspendedAt: null, suspendedReason: null })
    .where(eq(farms.id, farmId))
    .returning();
  return farm;
}
