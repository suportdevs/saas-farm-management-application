export type UserRole = 'user' | 'admin';

/**
 * The user shape returned by the API. Modules may attach extra fields
 * (e.g. `twoFactorEnabled`) through the API's user serializer hook,
 * which is why the index signature exists.
 */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: UserRole;
  emailVerified: boolean;
  hasPassword: boolean;
  createdAt: string;
  [extra: string]: unknown;
}

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

/** Returned by login when a module (e.g. two-factor) requires an extra step. */
export interface AuthChallengeResponse {
  challenge: string;
}

export interface LoginSuccessResponse {
  user: PublicUser;
}

export type LoginResponse = LoginSuccessResponse | AuthChallengeResponse;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
    requestId?: string;
  };
}

export interface AuthFeatures {
  emailVerification: 'off' | 'optional' | 'required';
  /** Forms protected by the math captcha. */
  captcha: string[];
  lockout: { maxAttempts: number; minutes: number } | null;
}

export interface AppFeatures {
  /** Installed module names, e.g. ["two-factor", "social-auth"]. */
  modules: string[];
  auth?: AuthFeatures;
  [extra: string]: unknown;
}

/** Extra fields only admins can see. */
export interface AdminUser extends PublicUser {
  bannedAt: string | null;
  bannedReason: string | null;
  lastLoginAt: string | null;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string | null;
  /** Populated in admin listings. */
  actor?: { id: string; name: string; email: string } | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminStats {
  users: {
    total: number;
    verified: number;
    admins: number;
    banned: number;
    new7d: number;
    new30d: number;
    activeSessions: number;
    activeUsers7d: number;
  };
  /** Sign-ups per day for the last 30 days (oldest first). */
  signups: { date: string; count: number }[];
  jobs: { pending: number; failed: number };
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
}

/** Present on GET /auth/session while an admin is signed in as another user. */
export interface Impersonator {
  id: string;
  name: string;
  email: string;
}
