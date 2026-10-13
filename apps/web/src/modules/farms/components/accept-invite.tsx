'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { FARM_TYPE_INFO, ROLE_INFO, type InvitationPreview } from '@kit/shared';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClasses } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { countryName, flag } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FARM_TYPE_ICONS } from '@/modules/farms/constants';

export function AcceptInvite({ token, user }: { token: string; user: { name: string; email: string } | null }) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState<string | null>(token ? null : 'This invitation link is incomplete.');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .post<{ invitation: InvitationPreview }>('/farms/invitations/lookup', { token })
      .then((r) => setInvitation(r.invitation))
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    try {
      const { farm } = await api.post<{ farm: { slug: string; name: string } }>('/farms/invitations/accept', { token });
      toast.success(`Welcome to ${farm.name}!`);
      router.push(`/farms/${farm.slug}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setAccepting(false);
    }
  };

  const next = encodeURIComponent(`/invite?token=${encodeURIComponent(token)}`);

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Invitation unavailable</h1>
        <Alert variant="error">{error}</Alert>
        <Link href={user ? '/dashboard' : '/login'} className={cn(buttonClasses('outline'), 'w-full')}>
          {user ? 'Go to your farms' : 'Sign in'}
        </Link>
      </div>
    );
  }
  if (!invitation) {
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const Icon = FARM_TYPE_ICONS[invitation.farm.type];
  const wrongAccount = user && user.email.toLowerCase() !== invitation.email.toLowerCase();
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">You&apos;re invited</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Join {invitation.farm.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {invitation.invitedBy ? `${invitation.invitedBy} invited you` : 'You were invited'} to join as{' '}
          <strong className="text-foreground">{ROLE_INFO[invitation.role].label.toLowerCase()}</strong>.
        </p>
      </div>

      <div className="flex items-center gap-4 rounded-2xl border bg-gradient-to-br from-primary/10 to-accent/10 p-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{invitation.farm.name}</p>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {FARM_TYPE_INFO[invitation.farm.type].label} · {countryName(invitation.farm.country)} {flag(invitation.farm.country)}
          </p>
        </div>
      </div>

      {!user ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This invitation is for <strong className="text-foreground">{invitation.email}</strong>. Create an account or sign in with that address.
          </p>
          <Link href={`/register?next=${next}`} className={cn(buttonClasses('primary', 'lg'), 'w-full')}>
            Create account &amp; join
          </Link>
          <Link href={`/login?next=${next}`} className={cn(buttonClasses('outline', 'lg'), 'w-full')}>
            I already have an account
          </Link>
        </div>
      ) : wrongAccount ? (
        <Alert variant="error">
          <p className="font-medium">Wrong account</p>
          <p>
            You&apos;re signed in as {user.email}, but this invitation was sent to {invitation.email}. Sign out and sign in with the invited address.
          </p>
        </Alert>
      ) : (
        <Button size="lg" className="w-full" loading={accepting} onClick={accept}>
          Accept &amp; open farm
        </Button>
      )}
    </div>
  );
}
