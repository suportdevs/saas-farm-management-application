'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { PublicUser } from '@kit/shared';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';
import { providerIcons } from './icons';
import { useProviders } from './use-providers';

interface Account {
  provider: string;
  email: string | null;
}

const errors: Record<string, string> = {
  oauth_account_in_use: 'That account is already connected to a different user.',
  oauth_failed: 'Connecting the account failed. Please try again.',
  oauth_cancelled: 'Connecting the account was cancelled.',
  oauth_email_missing: 'The provider did not share a verified email address.',
};

function Accounts({ user }: { user: PublicUser }) {
  const router = useRouter();
  const params = useSearchParams();
  const providers = useProviders();
  const [accounts, setAccounts] = useState<Account[] | null>(null);

  const load = useCallback(() => {
    api
      .get<{ accounts: Account[] }>('/oauth/accounts')
      .then((r) => setAccounts(r.accounts))
      .catch((err) => toast.error(errorMessage(err)));
  }, []);

  useEffect(load, [load]);

  // Feedback after returning from the provider.
  useEffect(() => {
    const linked = params.get('linked');
    const error = params.get('error');
    if (!linked && !error) return;
    if (linked) toast.success(`Connected ${linked}`);
    if (error) toast.error(errors[error] ?? 'Something went wrong');
    router.replace('/settings/security');
  }, [params, router]);

  const disconnect = async (provider: string) => {
    try {
      await api.delete(`/oauth/accounts/${provider}`);
      toast.success('Account disconnected');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (!providers?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected accounts</CardTitle>
        <CardDescription>Sign in faster by connecting a social account.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {providers.map((p) => {
            const Icon = providerIcons[p.id];
            const account = accounts?.find((a) => a.provider === p.id);
            const isOnlyMethod = !user.hasPassword && (accounts?.length ?? 0) <= 1;
            return (
              <li key={p.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3 text-sm">
                  {Icon && <Icon className="h-5 w-5" />}
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{account ? account.email ?? 'Connected' : 'Not connected'}</p>
                  </div>
                </div>
                {account ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnect(p.id)}
                    disabled={isOnlyMethod}
                    title={isOnlyMethod ? 'Set a password first' : undefined}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <a href={`/api/oauth/${p.id}?mode=link&next=/settings/security`} className={buttonClasses('outline', 'sm')}>
                    Connect
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export function ConnectedAccounts(props: { user: PublicUser }) {
  return (
    <Suspense>
      <Accounts {...props} />
    </Suspense>
  );
}
