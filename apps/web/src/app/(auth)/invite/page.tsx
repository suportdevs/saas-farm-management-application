import type { Metadata } from 'next';
import { AcceptInvite } from '@/modules/farms/components/accept-invite';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Join a farm' };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { user } = await getSession();
  return <AcceptInvite token={token ?? ''} user={user ? { name: user.name, email: user.email } : null} />;
}
