'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { PublicUser } from '@kit/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

export function EmailOtpSettings({ user }: { user: PublicUser }) {
  const router = useRouter();
  const enabled = Boolean(user.emailOtpEnabled);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const toggle = async (e?: FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    try {
      await api.post(enabled ? '/email-otp/disable' : '/email-otp/enable', { password: password || undefined });
      toast.success(enabled ? 'Email codes turned off' : 'Email codes turned on — you’ll get a code at each sign-in');
      setConfirming(false);
      setPassword('');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const start = () => (user.hasPassword ? setConfirming(true) : void toggle());

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MailCheck className="h-5 w-5 text-primary" />
          <CardTitle>Email sign-in codes</CardTitle>
          {enabled ? <Badge variant="success">On</Badge> : <Badge>Off</Badge>}
        </div>
        <CardDescription>After entering your password, confirm each sign-in with a 6-digit code sent to {user.email}.</CardDescription>
      </CardHeader>
      <CardContent>
        {confirming ? (
          <form onSubmit={toggle} className="space-y-3">
            <Field id="otp-password" label="Confirm your password">
              <Input id="otp-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" loading={loading} disabled={!password} variant={enabled ? 'destructive' : 'primary'}>
                {enabled ? 'Turn off' : 'Turn on'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant={enabled ? 'outline' : 'primary'} onClick={start} loading={loading} disabled={!enabled && !user.emailVerified}>
            {enabled ? 'Turn off email codes' : user.emailVerified ? 'Turn on email codes' : 'Verify your email first'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
