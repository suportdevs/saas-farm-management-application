import type { PublicUser } from '@kit/shared';
import type { User } from '../db/schema';
import { hooks } from './hooks';

/** Converts a DB user into the public API shape, letting modules add fields. */
export async function serializeUser(user: User): Promise<PublicUser> {
  const base: PublicUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
    hasPassword: Boolean(user.passwordHash),
    createdAt: user.createdAt.toISOString(),
  };
  const extras = await Promise.all(hooks.userSerializers.map((fn) => fn(user)));
  return Object.assign(base, ...extras);
}
