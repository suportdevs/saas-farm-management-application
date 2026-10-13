'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';

/** Full-page gate shown when EMAIL_VERIFICATION=required and the address isn't verified yet. */
export function VerifyEmailRequired({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'resend' | 'logout' | null>(null);

  const resend = async () => {
    setBusy('resend');
    try {
      await api.post('/auth/verify-email/resend');
      toast.success(`Verification email sent to ${email}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const logout = async () => {
    setBusy('logout');
    await api.post('/auth/logout').catch(() => {});
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <Logo />
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-8 shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MailCheck className="h-7 w-7" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to <strong className="text-foreground">{email}</strong>. Click it to activate your
          account, then refresh this page.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={() => router.refresh()}>I&apos;ve verified — continue</Button>
          <Button variant="outline" onClick={resend} loading={busy === 'resend'}>
            Resend email
          </Button>
          <Button variant="ghost" onClick={logout} loading={busy === 'logout'}>
            Use a different account
          </Button>
        </div>
      </div>
    </div>
  );
}
