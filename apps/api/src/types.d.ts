// Aliased: inside `namespace Express`, a bare `User` would resolve to
// `Express.User` (declared by Passport), not our DB user type.
import type { Session as DbSession, User as DbUser } from './db/schema';

declare global {
  namespace Express {
    interface Request {
      /** Set by the session middleware when a valid session cookie is present. */
      auth?: { session: DbSession; user: DbUser; token: string };
      /** Raw request body (JSON requests only) for webhook signature checks. */
      rawBody?: Buffer;
    }
  }
}

export {};
