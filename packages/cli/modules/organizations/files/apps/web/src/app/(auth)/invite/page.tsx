import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth-card';
import { getSession } from '@/lib/session';
import { AcceptInvite } from '@/modules/organizations/accept-invite';

export const metadata: Metadata = { title: 'Join organization' };

export default async function InvitePage() {
  const { user } = await getSession();
  return (
    <AuthCard title="You're invited">
      <Suspense>
        <AcceptInvite signedInEmail={user?.email ?? null} />
      </Suspense>
    </AuthCard>
  );
}
