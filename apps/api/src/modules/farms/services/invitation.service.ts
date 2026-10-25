import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import { ROLE_INFO, type FarmRole } from '@kit/shared';
import { badRequest, conflict, db, forbidden, notFound, randomToken, sha256, users, type User } from '../../../core';
import { farmCustomRoles, farmInvitations, farmMembers, farms, type Farm } from '../models';
import { sendInvitationEmail } from './email.service';
import { farmExtensions } from './farm.extensions';
import { resolveAssignment } from './member.service';
import { customRoleRef, type PermissionActor } from './role.service';

const DAY = 24 * 60 * 60 * 1000;
const INVITE_TTL = 7 * DAY;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Members plus pending invitations — both take a seat. */
export async function seatCount(farmId: string): Promise<number> {
  const [[members], [invites]] = await Promise.all([
    db.select({ value: count() }).from(farmMembers).where(eq(farmMembers.farmId, farmId)),
    db
      .select({ value: count() })
      .from(farmInvitations)
      .where(and(eq(farmInvitations.farmId, farmId), gt(farmInvitations.expiresAt, new Date()))),
  ]);
  return (members?.value ?? 0) + (invites?.value ?? 0);
}

export async function listInvitations(farmId: string) {
  const rows = await db
    .select({ invitation: farmInvitations, inviter: users.name, customRole: { id: farmCustomRoles.id, name: farmCustomRoles.name } })
    .from(farmInvitations)
    .leftJoin(users, eq(users.id, farmInvitations.invitedById))
    .leftJoin(farmCustomRoles, eq(farmCustomRoles.id, farmInvitations.customRoleId))
    .where(and(eq(farmInvitations.farmId, farmId), gt(farmInvitations.expiresAt, new Date())))
    .orderBy(desc(farmInvitations.createdAt));
  return rows.map(({ invitation: i, inviter, customRole }) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    customRole: customRoleRef(customRole),
    title: i.title,
    invitedBy: inviter,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  }));
}

/** Creates (or refreshes) an invitation and emails the link. */
export async function invite(
  farm: Farm,
  inviter: User,
  actor: PermissionActor,
  input: { email: string; role: FarmRole; customRoleId?: string | null; title?: string | null },
) {
  const assigned = await resolveAssignment(farm.id, actor, input);
  const [existingMember] = await db
    .select({ id: users.id })
    .from(farmMembers)
    .innerJoin(users, eq(users.id, farmMembers.userId))
    .where(and(eq(farmMembers.farmId, farm.id), eq(users.email, input.email)))
    .limit(1);
  if (existingMember) throw conflict('That person is already on the team', 'ALREADY_MEMBER');

  const [pending] = await db
    .select({ id: farmInvitations.id })
    .from(farmInvitations)
    .where(and(eq(farmInvitations.farmId, farm.id), eq(farmInvitations.email, input.email), gt(farmInvitations.expiresAt, new Date())))
    .limit(1);
  // Re-sending a pending invitation doesn't take another seat.
  if (!pending) await farmExtensions.guardSeat(farm, await seatCount(farm.id));

  const token = randomToken();
  const values = {
    farmId: farm.id,
    email: input.email,
    role: assigned.role,
    customRoleId: assigned.customRoleId,
    title: input.title ?? null,
    tokenHash: sha256(token),
    invitedById: inviter.id,
    expiresAt: new Date(Date.now() + INVITE_TTL),
  };
  const [invitation] = await db
    .insert(farmInvitations)
    .values(values)
    .onConflictDoUpdate({
      target: [farmInvitations.farmId, farmInvitations.email],
      set: {
        role: values.role,
        customRoleId: values.customRoleId,
        title: values.title,
        tokenHash: values.tokenHash,
        invitedById: inviter.id,
        expiresAt: values.expiresAt,
        createdAt: sql`now()`,
      },
    })
    .returning();
  await sendInvitationEmail({ to: input.email, token, farm, inviter, roleLabel: assigned.label });
  return { invitation: invitation!, roleLabel: assigned.label };
}

/** Invites the owner of a farm the platform team created for a client. */
export async function inviteOwner(farm: Farm, email: string, staff: User) {
  const token = randomToken();
  await db.insert(farmInvitations).values({
    farmId: farm.id,
    email,
    role: 'owner',
    title: 'Farm owner',
    tokenHash: sha256(token),
    invitedById: staff.id,
    expiresAt: new Date(Date.now() + INVITE_TTL),
  });
  await sendInvitationEmail({ to: email, token, farm, inviter: staff, roleLabel: ROLE_INFO.owner.label });
}

export async function revokeInvitation(farmId: string, invitationId: string) {
  if (!uuidPattern.test(invitationId)) throw notFound('Invitation not found');
  const [deleted] = await db
    .delete(farmInvitations)
    .where(and(eq(farmInvitations.farmId, farmId), eq(farmInvitations.id, invitationId)))
    .returning({ email: farmInvitations.email });
  if (!deleted) throw notFound('Invitation not found');
  return deleted;
}

async function findInvitation(token: string) {
  const [row] = await db
    .select({ invitation: farmInvitations, farm: farms, customRole: { id: farmCustomRoles.id, name: farmCustomRoles.name } })
    .from(farmInvitations)
    .innerJoin(farms, eq(farms.id, farmInvitations.farmId))
    .leftJoin(farmCustomRoles, eq(farmCustomRoles.id, farmInvitations.customRoleId))
    .where(and(eq(farmInvitations.tokenHash, sha256(token)), gt(farmInvitations.expiresAt, new Date())))
    .limit(1);
  return row;
}

/** Public details shown on the invitation page before accepting. */
export async function lookupInvitation(token: string) {
  const row = await findInvitation(token);
  if (!row) return null;
  const inviter = row.invitation.invitedById
    ? await db.query.users.findFirst({ where: eq(users.id, row.invitation.invitedById) })
    : undefined;
  return {
    farm: { name: row.farm.name, slug: row.farm.slug, type: row.farm.type, country: row.farm.country },
    email: row.invitation.email,
    role: row.invitation.role,
    customRole: customRoleRef(row.customRole),
    invitedBy: inviter?.name ?? null,
  };
}

export async function acceptInvitation(token: string, user: User) {
  const row = await findInvitation(token);
  if (!row) throw badRequest('This invitation is invalid or has expired', 'INVALID_INVITATION');
  if (row.invitation.email !== user.email.toLowerCase()) {
    throw forbidden(`This invitation was sent to ${row.invitation.email}. Sign in with that address to accept it.`, 'INVITATION_EMAIL_MISMATCH');
  }
  if (row.farm.suspendedAt) throw forbidden('This farm is currently suspended', 'FARM_SUSPENDED');
  await db.transaction(async (tx) => {
    await tx
      .insert(farmMembers)
      .values({
        farmId: row.farm.id,
        userId: user.id,
        role: row.invitation.role,
        customRoleId: row.invitation.customRoleId,
        title: row.invitation.title,
        lastAccessedAt: new Date(),
      })
      .onConflictDoNothing();
    await tx.delete(farmInvitations).where(eq(farmInvitations.id, row.invitation.id));
  });
  return { farm: row.farm, role: row.customRole?.name ?? row.invitation.role };
}
