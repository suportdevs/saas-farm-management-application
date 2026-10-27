import { PageHeader } from '@/components/app/page-header';
import { Badge } from '@/components/ui/badge';
import { requireAdmin } from '@/lib/session';

/** Platform admin pages. Their menu lives in the sidebar (modules/platform/navigation.ts). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <>
      <PageHeader
        title="Platform admin"
        description="Tenants, revenue, users and security activity across the platform."
        actions={user.staffRoleName && <Badge variant="primary">{user.staffRoleName}</Badge>}
      />
      {children}
    </>
  );
}
