import type { Request } from 'express';
import type { User } from '../db/schema';

export interface LoginContext {
  user: User;
  req: Request;
  /** How the user proved their identity, e.g. "password", "oauth:google". */
  method: string;
}

/** Return a challenge name (e.g. "two-factor") to require an extra step, or null to allow. */
export type LoginGuard = (ctx: LoginContext) => Promise<string | null> | string | null;
/** Return extra fields merged into the public user object (GET /auth/me etc). */
export type UserSerializer = (user: User) => Promise<Record<string, unknown>> | Record<string, unknown>;
export type UserListener = (user: User) => Promise<void> | void;
/** Return extra fields merged into GET /api/features. */
export type FeatureProvider = () => Promise<Record<string, unknown>> | Record<string, unknown>;

/**
 * Extension points that modules plug into. Core auth code calls these at
 * well-defined moments so features like 2FA or social login can be added
 * without touching core files.
 */
class Hooks {
  readonly loginGuards: LoginGuard[] = [];
  readonly userSerializers: UserSerializer[] = [];
  readonly userCreated: UserListener[] = [];
  readonly userDeleting: UserListener[] = [];
  readonly featureProviders: FeatureProvider[] = [];

  addLoginGuard(fn: LoginGuard) {
    this.loginGuards.push(fn);
  }
  addUserSerializer(fn: UserSerializer) {
    this.userSerializers.push(fn);
  }
  onUserCreated(fn: UserListener) {
    this.userCreated.push(fn);
  }
  onUserDeleting(fn: UserListener) {
    this.userDeleting.push(fn);
  }
  addFeatures(fn: FeatureProvider) {
    this.featureProviders.push(fn);
  }

  async runLoginGuards(ctx: LoginContext): Promise<string | null> {
    for (const guard of this.loginGuards) {
      const challenge = await guard(ctx);
      if (challenge) return challenge;
    }
    return null;
  }

  async emit(listeners: UserListener[], user: User) {
    for (const fn of listeners) await fn(user);
  }
}

export const hooks = new Hooks();
export type { Hooks };
