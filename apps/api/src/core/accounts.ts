import { eq } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db/client';
import { users, type User } from '../db/schema';
import { softDeleted } from '../db/soft-delete';
import { sendWelcomeEmail } from '../modules/auth/services/email.service';
import { audit } from './audit';
import { currentRequest } from './context';
import { hooks } from './hooks';
import { deleteUserSessions } from './session';
import { deleteUserTokens } from './tokens';

/**
 * Automatic role assignment: verified users whose address is listed in
 * ADMIN_EMAILS become admins. Only applied once the email is proven, so
 * nobody can claim an admin address by registering it first.
 */
export async function applyRoleRules(user: User): Promise<User> {
  if (!user.emailVerifiedAt || user.role === 'admin') return user;
  if (!env.ADMIN_EMAILS.includes(user.email.toLowerCase())) return user;
  const [updated] = await db.update(users).set({ role: 'admin' }).where(eq(users.id, user.id)).returning();
  await audit(currentRequest() ?? null, {
    action: 'user.role_auto_assigned',
    actorId: null,
    targetType: 'user',
    targetId: user.id,
    metadata: { role: 'admin', rule: 'ADMIN_EMAILS' },
  });
  return updated ?? user;
}

/** Runs once an account is usable: right after a verified sign-up, or when the email gets verified. */
export async function onAccountActivated(user: User) {
  await applyRoleRules(user);
  if (env.SEND_WELCOME_EMAIL) await sendWelcomeEmail(user.email, user.name);
}

/**
 * Deletes an account (soft — data is never removed). Modules clean up first
 * through hooks.userDeleting (farms pass on, memberships end). The row is kept
 * and marked deleted; sessions and pending email links are removed so nothing
 * can sign in as it. The email can be used for a new account afterwards.
 *
 * `anonymize` (the user deleting their own account) also clears their name,
 * email, password and photo; records then show "Deleted user".
 */
export async function softDeleteUser(user: User, { anonymize }: { anonymize: boolean }) {
  await hooks.emit(hooks.userDeleting, user);
  const personalData = anonymize ? { name: 'Deleted user', email: `deleted-${user.id}@deleted.invalid`, passwordHash: null, image: null } : {};
  await db
    .update(users)
    .set({ ...softDeleted(), ...personalData })
    .where(eq(users.id, user.id));
  await deleteUserSessions(user.id);
  await deleteUserTokens(user.id);
}

export function registerAccountHooks() {
  hooks.onUserCreated(async (user) => {
    // Social sign-ups arrive verified; with verification off nobody waits for a link.
    if (user.emailVerifiedAt || env.EMAIL_VERIFICATION === 'off') await onAccountActivated(user);
  });
}
