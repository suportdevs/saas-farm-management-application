import type { Metadata } from 'next';
import { ORG_ROLE_INFO } from '@kit/shared';
import { PageHeader } from '@/components/app/page-header';
import { requireUser } from '@/lib/session';
import { OrganizationManager } from '@/modules/farms/components/organization-manager';
import { getOrganization } from '@/modules/farms/server';

export const metadata: Metadata = { title: 'Organization' };

export default async function OrganizationPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const [user, detail] = await Promise.all([requireUser(), getOrganization(org)]);
  return (
    <>
      <PageHeader eyebrow="Organization" title={detail.organization.name} description={`You are ${ORG_ROLE_INFO[detail.role].label.toLowerCase()} of this organization.`} />
      <OrganizationManager detail={detail} currentUserId={user.id} />
    </>
  );
}
