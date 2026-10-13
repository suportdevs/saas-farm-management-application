import { eq } from 'drizzle-orm';
import type { RegisterInput } from '@kit/shared';
import { db } from '../../db/client';
import { users, type User } from '../../db/schema';
import { onAccountActivated } from '../../core/accounts';
import { hooks } from '../../core/hooks';
import { env } from '../../config/env';
import { consumeToken, consumeTokenData, issueToken } from '../../core/tokens';
import { deleteUserSessions } from '../../core/session';
import { badRequest, conflict } from '../../lib/errors';
import { fakePasswordVerify, hashPassword, verifyPassword } from '../../lib/password';
import {
  sendEmailChangeConfirmation,
  sendEmailChangeNotice,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from './emails';

const HOUR = 60 * 60 * 1000;

export function findUserByEmail(email: string) {
  return db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
}

export async function registerUser(input: RegisterInput): Promise<User> {
  if (await findUserByEmail(input.email)) {
    throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
  }
  const [user] = await db
    .insert(users)
    .values({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password) })
    .returning();
  await hooks.emit(hooks.userCreated, user!);
  if (env.EMAIL_VERIFICATION !== 'off') await sendEmailVerification(user!);
  return user!;
}

/** Returns the user if credentials are valid. Timing is constant for unknown emails. */
export async function authenticate(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user?.passwordHash) {
    await fakePasswordVerify(password);
    return null;
  }
  return (await verifyPassword(user.passwordHash, password)) ? user : null;
}

export async function sendEmailVerification(user: User) {
  if (user.emailVerifiedAt) return;
  const token = await issueToken(user.id, 'email_verification', 24 * HOUR);
  await sendVerificationEmail(user.email, user.name, token);
}

export async function verifyEmail(token: string): Promise<boolean> {
  const userId = await consumeToken(token, 'email_verification');
  if (!userId) return false;
  const [user] = await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId)).returning();
  if (user) await onAccountActivated(user);
  return true;
}

export async function requestPasswordReset(email: string) {
  const user = await findUserByEmail(email);
  if (!user) return; // don't reveal whether the account exists
  const token = await issueToken(user.id, 'password_reset', HOUR);
  await sendPasswordResetEmail(user.email, user.name, token);
}

/** Returns the user id on success, or null if the token is invalid/expired. */
export async function resetPassword(token: string, password: string): Promise<string | null> {
  const userId = await consumeToken(token, 'password_reset');
  if (!userId) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      // Receiving the reset email proves ownership of the inbox.
      emailVerifiedAt: user?.emailVerifiedAt ?? new Date(),
    })
    .where(eq(users.id, userId));
  await deleteUserSessions(userId);
  return userId;
}

/** Starts an email change: the new address must be confirmed before it takes effect. */
export async function requestEmailChange(user: User, newEmail: string) {
  const email = newEmail.toLowerCase();
  if (email === user.email) throw badRequest('That is already your email address', 'SAME_EMAIL');
  if (await findUserByEmail(email)) throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
  const token = await issueToken(user.id, 'email_change', HOUR, { email });
  await sendEmailChangeConfirmation(email, user.name, token);
  await sendEmailChangeNotice(user.email, user.name, email);
}

/** Applies a confirmed email change. Returns the old and new address, or null if the token is invalid. */
export async function confirmEmailChange(token: string): Promise<{ userId: string; from: string; to: string } | null> {
  const result = await consumeTokenData(token, 'email_change');
  const email = typeof result?.data.email === 'string' ? result.data.email : null;
  if (!result || !email) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, result.userId) });
  if (!user) return null;
  if (await findUserByEmail(email)) throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
  // Clicking the link proves ownership of the new inbox.
  await db.update(users).set({ email, emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
  return { userId: user.id, from: user.email, to: email };
}
