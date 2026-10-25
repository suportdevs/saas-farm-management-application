import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/page-header';
import { OrganizationList } from '@/modules/farms/components/organization-list';
import { getOrganizations } from '@/modules/farms/server';

export const metadata: Metadata = { title: 'Organizations' };

export default async function OrganizationsPage() {
  const organizations = await getOrganizations();
  return (
    <>
      <PageHeader title="Organizations" description="The businesses your farms belong to." />
      <OrganizationList organizations={organizations} />
    </>
  );
}
