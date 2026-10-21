import type { Metadata } from 'next';
import type { PlatformRole } from '@kit/shared';
import { StaffRolesManager } from '@/components/admin/staff-roles-manager';
import { requireAdmin, serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'Staff roles' };

export default async function StaffRolesPage() {
  const me = await requireAdmin('platform.staff.manage');
  const data = await serverFetch<{ roles: PlatformRole[] }>('/admin/staff-roles');
  return <StaffRolesManager roles={data?.roles ?? []} myPermissions={me.platformPermissions ?? []} myRole={me.staffRole ?? null} />;
}
