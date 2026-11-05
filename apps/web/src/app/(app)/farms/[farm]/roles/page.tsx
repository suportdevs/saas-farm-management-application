import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { FarmPermissions } from '@kit/shared';
import { RolesManager } from '@/modules/farms/components/roles-manager';
import { getFarmContext } from '@/modules/farms/server';
import { serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'Roles' };

export default async function RolesPage({ params }: { params: Promise<{ farm: string }> }) {
  const { farm: slug } = await params;
  const ctx = await getFarmContext(slug);
  if (!ctx.membership.permissions.includes('roles.view')) notFound();
  const permissions = await serverFetch<FarmPermissions>(`/farms/${slug}/permissions`);
  if (!permissions) notFound();
  return <RolesManager initial={permissions} />;
}
