import { STAFF_ROLE_INFO } from '@kit/shared';
import { AdminTabs } from '@/components/admin/admin-tabs';
import { PageHeader } from '@/components/app/page-header';
import { Badge } from '@/components/ui/badge';
import { requireAdmin } from '@/lib/session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <>
      <PageHeader
        title="Platform admin"
        description="Tenants, revenue, users and security activity across the platform."
        actions={user.staffRole && <Badge variant="primary">{STAFF_ROLE_INFO[user.staffRole].label}</Badge>}
      />
      <AdminTabs permissions={user.platformPermissions ?? []} />
      {children}
    </>
  );
}
