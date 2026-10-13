import { eq } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db/client';
import { users, type User } from '../db/schema';
import { sendWelcomeEmail } from '../modules/auth/emails';
import { audit } from './audit';
import { currentRequest } from './context';
import { hooks } from './hooks';

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

export function registerAccountHooks() {
  hooks.onUserCreated(async (user) => {
    // Social sign-ups arrive verified; with verification off nobody waits for a link.
    if (user.emailVerifiedAt || env.EMAIL_VERIFICATION === 'off') await onAccountActivated(user);
  });
}
