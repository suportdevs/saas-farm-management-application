import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/app/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { requireUser, serverFetch } from '@/lib/session';
import { CreateOrgForm } from '@/modules/organizations/create-org-form';
import { roleLabels, type Organization } from '@/modules/organizations/types';

export const metadata: Metadata = { title: 'Organizations' };

export default async function OrganizationsPage() {
  await requireUser();
  const data = await serverFetch<{ organizations: Organization[] }>('/organizations');
  const orgs = data?.organizations ?? [];

  return (
    <>
      <PageHeader title="Organizations" description="Teams you belong to." />
      <div className="space-y-6">
        {orgs.length > 0 && (
          <Card className="divide-y">
            {orgs.map((org) => (
              <Link key={org.id} href={`/orgs/${org.slug}`} className="flex items-center gap-4 p-4 hover:bg-muted/40">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <p className="font-medium">{org.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {org.memberCount} member{org.memberCount === 1 ? '' : 's'}
                  </p>
                </div>
                <Badge variant={org.role === 'owner' ? 'primary' : 'default'}>{roleLabels[org.role]}</Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </Card>
        )}
        <CreateOrgForm />
      </div>
    </>
  );
}
