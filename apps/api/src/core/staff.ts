import { eq } from 'drizzle-orm';
import {
  cleanPlatformPermissions,
  isStaffRole,
  STAFF_ROLE_INFO,
  staffRoleOf,
  systemStaffPermissions,
  type PlatformPermission,
} from '@kit/shared';
import { db } from '../db/client';
import { platformRoles, type User } from '../db/schema';

export interface StaffAccess {
  /** Staff role key: built-in (super_admin…) or a custom platform_roles key. */
  key: string;
  name: string;
  permissions: PlatformPermission[];
}

/**
 * What a user may do in the operator console. Built-in staff roles come from
 * code; custom ones from `platform_roles`. A custom role that was deleted
 * grants nothing. Non-staff get null.
 */
export async function resolveStaff(user: Pick<User, 'role' | 'staffRole'>): Promise<StaffAccess | null> {
  const key = staffRoleOf(user);
  if (!key) return null;
  if (isStaffRole(key)) return { key, name: STAFF_ROLE_INFO[key].label, permissions: systemStaffPermissions(key) };
  const [row] = await db.select().from(platformRoles).where(eq(platformRoles.key, key)).limit(1);
  return row ? { key, name: row.name, permissions: cleanPlatformPermissions(row.permissions) } : { key, name: key, permissions: [] };
}

export const staffPermissionsOf = async (user: Pick<User, 'role' | 'staffRole'>) => (await resolveStaff(user))?.permissions ?? [];
