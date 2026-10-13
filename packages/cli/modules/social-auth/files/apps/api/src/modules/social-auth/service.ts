import { and, eq } from 'drizzle-orm';
import { db, deleteUserSessions, hooks, users, type User } from '../../core';
import type { OAuthProfile } from './providers';
import { oauthAccounts } from './schema';

export class OAuthError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

async function findUser(where: ReturnType<typeof eq>) {
  const [user] = await db.select().from(users).where(where).limit(1);
  return user;
}

/**
 * Resolves the user for a social sign-in:
 *  1. an already linked account → its user
 *  2. a user with the same verified email → link and sign in
 *  3. otherwise → create a new user
 */
export async function findOrCreateUser(profile: OAuthProfile): Promise<User> {
  const [linked] = await db
    .select({ user: users })
    .from(oauthAccounts)
    .innerJoin(users, eq(oauthAccounts.userId, users.id))
    .where(and(eq(oauthAccounts.provider, profile.provider), eq(oauthAccounts.providerAccountId, profile.id)))
    .limit(1);
  if (linked) return linked.user;

  if (!profile.email || !profile.emailVerified) throw new OAuthError('oauth_email_missing');

  const existing = await findUser(eq(users.email, profile.email));
  if (existing) {
    if (!existing.emailVerifiedAt) {
      // Someone registered this email without proving they own it. The provider
      // just proved ownership, so drop the untrusted password & sessions to
      // prevent a pre-registration account takeover.
      await db
        .update(users)
        .set({ emailVerifiedAt: new Date(), passwordHash: null })
        .where(eq(users.id, existing.id));
      await deleteUserSessions(existing.id);
      existing.emailVerifiedAt = new Date();
      existing.passwordHash = null;
    }
    await linkAccount(existing.id, profile);
    return existing;
  }

  const [created] = await db
    .insert(users)
    .values({
      email: profile.email,
      name: profile.name.slice(0, 100),
      image: profile.image,
      emailVerifiedAt: new Date(),
    })
    .returning();
  await linkAccount(created!.id, profile);
  await hooks.emit(hooks.userCreated, created!);
  return created!;
}

export async function linkAccount(userId: string, profile: OAuthProfile) {
  const [owner] = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, profile.provider), eq(oauthAccounts.providerAccountId, profile.id)))
    .limit(1);
  if (owner && owner.userId !== userId) throw new OAuthError('oauth_account_in_use');
  if (owner) return;
  await db
    .insert(oauthAccounts)
    .values({ userId, provider: profile.provider, providerAccountId: profile.id, email: profile.email })
    .onConflictDoUpdate({
      target: [oauthAccounts.userId, oauthAccounts.provider],
      set: { providerAccountId: profile.id, email: profile.email },
    });
}

export function listAccounts(userId: string) {
  return db
    .select({ provider: oauthAccounts.provider, email: oauthAccounts.email, createdAt: oauthAccounts.createdAt })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, userId));
}

/** Unlinks a provider unless it's the user's only way to sign in. */
export async function unlinkAccount(user: User, provider: string) {
  const accounts = await listAccounts(user.id);
  if (!accounts.some((a) => a.provider === provider)) return false;
  if (!user.passwordHash && accounts.length <= 1) throw new OAuthError('last_login_method');
  await db.delete(oauthAccounts).where(and(eq(oauthAccounts.userId, user.id), eq(oauthAccounts.provider, provider)));
  return true;
}
