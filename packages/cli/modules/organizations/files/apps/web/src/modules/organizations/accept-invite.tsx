'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClasses } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { roleLabels, type OrgRole } from './types';

interface InvitationInfo {
  organization: { name: string; slug: string };
  email: string;
  role: OrgRole;
  invitedBy: string | null;
}

export function AcceptInvite({ signedInEmail }: { signedInEmail: string | null }) {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState<string | null>(token ? null : 'This invitation link is missing its token.');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .post<{ invitation: InvitationInfo }>('/organizations/invitations/lookup', { token })
      .then((res) => setInfo(res.invitation))
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    try {
      const { organization } = await api.post<{ organization: { slug: string } }>('/organizations/invitations/accept', { token });
      router.push(`/orgs/${organization.slug}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setAccepting(false);
    }
  };

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!info)
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading invitation…
      </div>
    );

  const next = encodeURIComponent(`/invite?token=${token}`);
  const wrongAccount = signedInEmail && signedInEmail !== info.email;

  return (
    <div className="space-y-4 text-sm">
      <p>
        {info.invitedBy ? <strong>{info.invitedBy}</strong> : 'Someone'} invited <strong>{info.email}</strong> to join{' '}
        <strong>{info.organization.name}</strong> as {roleLabels[info.role].toLowerCase()}.
      </p>
      {!signedInEmail ? (
        <div className="space-y-2">
          <Link href={`/register?next=${next}`} className={buttonClasses('primary', 'md', 'w-full')}>
            Create an account to join
          </Link>
          <Link href={`/login?next=${next}`} className={buttonClasses('outline', 'md', 'w-full')}>
            I already have an account
          </Link>
        </div>
      ) : wrongAccount ? (
        <Alert variant="error">
          You&apos;re signed in as {signedInEmail}. Sign out and sign in as {info.email} to accept this invitation.
        </Alert>
      ) : (
        <Button className="w-full" onClick={accept} loading={accepting}>
          Join {info.organization.name}
        </Button>
      )}
    </div>
  );
}
