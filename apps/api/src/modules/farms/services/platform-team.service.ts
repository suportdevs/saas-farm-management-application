import { and, eq, ne } from 'drizzle-orm';
import { PERMISSIONS, type FarmRole } from '@kit/shared';
import { conflict, db, isUuid, notDeleted, notFound, softDeleted, users, type User } from '../../../core';
import { farmInvitations, farmMembers, farms, type Farm } from '../models';
import { farmExtensions } from './farm.extensions';
import { invite, seatCount } from './invitation.service';
import { addMember } from './member.service';
import { findOrganization } from './organization.service';
import type { PermissionActor } from './role.service';

/**
 * Team changes made by the platform team on a client's farm (support, manual
 * onboarding). Staff act with owner rights; plan seat limits still apply.
 */
export const platformActor = (staff: User): PermissionActor => ({ userId: staff.id, role: 'owner', customRoleId: null, permissions: [...PERMISSIONS] });

/** Adds someone to the farm: an existing account joins straight away, anyone else gets an invitation. */
export async function addMemberAsPlatform(farm: Farm, staff: User, email: string, role: FarmRole) {
  const user = await db.query.users.findFirst({ where: and(eq(users.email, email), notDeleted(users)) });
  if (!user) {
    await invite(farm, staff, platformActor(staff), { email, role });
    return { invited: true as const, userId: null };
  }
  const [existing] = await db
    .select({ userId: farmMembers.userId })
    .from(farmMembers)
    .where(and(eq(farmMembers.farmId, farm.id), eq(farmMembers.userId, user.id), notDeleted(farmMembers)))
    .limit(1);
  if (existing) throw conflict('That person is already on the team', 'ALREADY_MEMBER');
  await farmExtensions.guardSeat(farm, await seatCount(farm.id));
  await db.transaction(async (tx) => {
    await addMember(tx, { farmId: farm.id, userId: user.id, role });
    // A pending invitation for the same address is no longer needed.
    await tx
      .update(farmInvitations)
      .set(softDeleted())
      .where(and(eq(farmInvitations.farmId, farm.id), eq(farmInvitations.email, email), notDeleted(farmInvitations)));
  });
  return { invited: false as const, userId: user.id };
}

/** Makes a member the farm's owner. The other owners become managers unless `keepOwners`. */
export async function transferOwnership(farmId: string, userId: string, keepOwners: boolean) {
  const [target] = await db
    .select()
    .from(farmMembers)
    .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.userId, userId), notDeleted(farmMembers)))
    .limit(1);
  if (!target) throw notFound('Member not found');
  await db.transaction(async (tx) => {
    await tx
      .update(farmMembers)
      .set({ role: 'owner', customRoleId: null, permissionOverrides: {} })
      .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.userId, userId)));
    if (!keepOwners) {
      await tx
        .update(farmMembers)
        .set({ role: 'manager' })
        .where(and(eq(farmMembers.farmId, farmId), eq(farmMembers.role, 'owner'), ne(farmMembers.userId, userId), notDeleted(farmMembers)));
    }
  });
  return { previousRole: target.role };
}

/** Sends a pending invitation again with a fresh link (same role). */
export async function resendInvitation(farm: Farm, staff: User, invitationId: string) {
  if (!isUuid(invitationId)) throw notFound('Invitation not found');
  const [row] = await db
    .select()
    .from(farmInvitations)
    .where(and(eq(farmInvitations.farmId, farm.id), eq(farmInvitations.id, invitationId), notDeleted(farmInvitations)))
    .limit(1);
  if (!row) throw notFound('Invitation not found');
  return invite(farm, staff, platformActor(staff), { email: row.email, role: row.role, customRoleId: row.customRoleId, title: row.title });
}

/** Moves a farm to another organization: the old organization's owners and admins lose their access through it. */
export async function moveFarmToOrganization(farm: Farm, organizationId: string) {
  const org = await findOrganization(organizationId);
  if (!org) throw notFound('Organization not found', 'ORGANIZATION_NOT_FOUND');
  if (org.id === farm.organizationId) return { from: farm.organizationId, to: org };
  await db.update(farms).set({ organizationId: org.id }).where(eq(farms.id, farm.id));
  return { from: farm.organizationId, to: org };
}
