import { requireAdmin } from '@/lib/session';
import { AdminHeader } from '@/modules/platform/components/admin-header';

/** Platform admin pages. Their menu lives in the sidebar (modules/platform/navigation.ts). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <>
      <AdminHeader roleName={user.staffRoleName} permissions={user.platformPermissions ?? []} />
      {children}
    </>
  );
}
