import { and, eq } from 'drizzle-orm';
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
import { notDeleted } from '../db/soft-delete';

/** The developer / software-owner account (users.is_developer). */
export const isDeveloper = (user?: { isDeveloper?: boolean | null } | null) => Boolean(user?.isDeveloper);

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
export async function resolveStaff(user: Pick<User, 'role' | 'staffRole'> & Partial<Pick<User, 'isDeveloper'>>): Promise<StaffAccess | null> {
  // The developer always has every platform permission, whatever the staff role says.
  if (isDeveloper(user)) return { key: 'super_admin', name: 'Developer', permissions: systemStaffPermissions('super_admin') };
  const key = staffRoleOf(user);
  if (!key) return null;
  if (isStaffRole(key)) return { key, name: STAFF_ROLE_INFO[key].label, permissions: systemStaffPermissions(key) };
  const [row] = await db
    .select()
    .from(platformRoles)
    .where(and(eq(platformRoles.key, key), notDeleted(platformRoles)))
    .limit(1);
  return row ? { key, name: row.name, permissions: cleanPlatformPermissions(row.permissions) } : { key, name: key, permissions: [] };
}

export const staffPermissionsOf = async (user: Pick<User, 'role' | 'staffRole'> & Partial<Pick<User, 'isDeveloper'>>) => (await resolveStaff(user))?.permissions ?? [];
