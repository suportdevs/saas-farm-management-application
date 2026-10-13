import { AdminTabs } from '@/components/admin/admin-tabs';
import { PageHeader } from '@/components/app/page-header';
import { requireAdmin } from '@/lib/session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Platform admin" description="Tenants, revenue, users and security activity across the platform." />
      <AdminTabs />
      {children}
    </>
  );
}
