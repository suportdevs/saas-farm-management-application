import { eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { users, type User } from '../../../db/schema';
import { softDeleteUser } from '../../../core/accounts';
import { deleteUserSessions } from '../../../core/session';
import { badRequest } from '../../../lib/errors';
import { hashPassword, verifyPassword } from '../../../lib/password';
import { sendPasswordChangedEmail } from '../../auth/services/email.service';

/**
 * Checks the user's current password. Accounts created through social login
 * have none yet, so there is nothing to confirm.
 */
export async function assertPassword(user: User, password: string | undefined, message = 'Password is incorrect') {
  if (user.passwordHash && !(password && (await verifyPassword(user.passwordHash, password)))) {
    throw badRequest(message, 'INVALID_PASSWORD');
  }
}

export async function updateProfile(userId: string, patch: { name: string }) {
  const [user] = await db.update(users).set(patch).where(eq(users.id, userId)).returning();
  return user!;
}

/** Sets a new password and signs out every other session. */
export async function changePassword(user: User, keepSessionId: string, currentPassword: string | undefined, newPassword: string) {
  await assertPassword(user, currentPassword, 'Current password is incorrect');
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, user.id));
  await deleteUserSessions(user.id, keepSessionId);
  await sendPasswordChangedEmail(user.email, user.name);
}

/** Deletes the user's own account (soft, with their name and email anonymized). */
export async function deleteAccount(user: User) {
  await softDeleteUser(user, { anonymize: true });
}
