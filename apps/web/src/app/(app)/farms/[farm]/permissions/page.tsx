import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { FarmMember, FarmPermissions } from '@kit/shared';
import { PermissionsManager } from '@/modules/farms/components/permissions-manager';
import { getFarmContext } from '@/modules/farms/server';
import { requireUser, serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'Roles & permissions' };

export default async function PermissionsPage({ params }: { params: Promise<{ farm: string }> }) {
  const { farm: slug } = await params;
  const [user, ctx] = await Promise.all([requireUser(), getFarmContext(slug)]);
  if (!ctx.membership.permissions.includes('roles.view')) notFound();
  const [permissions, members] = await Promise.all([
    serverFetch<FarmPermissions>(`/farms/${slug}/permissions`),
    serverFetch<{ members: FarmMember[] }>(`/farms/${slug}/members`),
  ]);
  if (!permissions) notFound();
  return <PermissionsManager initial={permissions} members={members?.members ?? []} currentUserId={user.id} />;
}
