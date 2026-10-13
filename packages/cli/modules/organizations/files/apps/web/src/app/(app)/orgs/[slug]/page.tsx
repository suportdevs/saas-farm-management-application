import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/app/page-header';
import { Badge } from '@/components/ui/badge';
import { requireUser, serverFetch } from '@/lib/session';
import { OrgMembers } from '@/modules/organizations/org-members';
import { OrgSettings } from '@/modules/organizations/org-settings';
import { canManage, roleLabels, type OrgInvitation, type OrgMember, type Organization } from '@/modules/organizations/types';

export const metadata: Metadata = { title: 'Organization' };

export default async function OrganizationPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
  const data = await serverFetch<{ organization: Organization }>(`/organizations/${encodeURIComponent(slug)}`);
  if (!data) notFound();
  const org = data.organization;

  const [members, invitations] = await Promise.all([
    serverFetch<{ members: OrgMember[] }>(`/organizations/${org.id}/members`),
    canManage(org.role) ? serverFetch<{ invitations: OrgInvitation[] }>(`/organizations/${org.id}/invitations`) : null,
  ]);

  return (
    <>
      <Link href="/orgs" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Organizations
      </Link>
      <PageHeader title={org.name} description={`/orgs/${org.slug}`} actions={<Badge variant="primary">{roleLabels[org.role]}</Badge>} />
      <div className="space-y-6">
        <OrgMembers org={org} members={members?.members ?? []} invitations={invitations?.invitations ?? []} currentUserId={user.id} />
        <OrgSettings org={org} currentUserId={user.id} />
      </div>
    </>
  );
}
