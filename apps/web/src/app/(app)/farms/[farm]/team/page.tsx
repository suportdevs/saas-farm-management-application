import type { Metadata } from 'next';
import type { FarmInvitation, FarmMember } from '@kit/shared';
import { TeamManager } from '@/modules/farms/components/team-manager';
import { getFarmContext } from '@/modules/farms/server';
import { requireUser, serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage({ params, searchParams }: { params: Promise<{ farm: string }>; searchParams: Promise<{ invite?: string }> }) {
  const { farm: slug } = await params;
  const { invite } = await searchParams;
  const [user, ctx] = await Promise.all([requireUser(), getFarmContext(slug)]);
  const canManage = ctx.membership.permissions.includes('members.manage');
  const [members, invitations] = await Promise.all([
    serverFetch<{ members: FarmMember[] }>(`/farms/${slug}/members`),
    canManage ? serverFetch<{ invitations: FarmInvitation[] }>(`/farms/${slug}/invitations`) : null,
  ]);
  return (
    <TeamManager
      currentUserId={user.id}
      members={members?.members ?? []}
      invitations={invitations?.invitations ?? []}
      openInvite={invite === '1' && canManage}
    />
  );
}
