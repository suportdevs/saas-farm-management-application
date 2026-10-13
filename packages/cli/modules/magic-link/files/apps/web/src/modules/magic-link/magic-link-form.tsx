'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { MailCheck, Sparkles } from 'lucide-react';
import { useCaptcha } from '@/components/auth/captcha';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

function MagicLink() {
  const nextParam = useSearchParams().get('next');
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : undefined;
  const captcha = useCaptcha('magic-link');
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/magic-link/request', { email, next, captcha: captcha.value });
      setSentTo(email);
    } catch (err) {
      setError(errorMessage(err));
      void captcha.refresh();
    } finally {
      setLoading(false);
    }
  };

  if (sentTo)
    return (
      <Alert variant="success">
        <span className="flex items-center gap-1.5 font-medium">
          <MailCheck className="h-4 w-4" /> Check your inbox
        </span>
        If an account exists for <strong>{sentTo}</strong>, a sign-in link is on its way. It expires shortly and works once.
      </Alert>
    );

  if (!open)
    return (
      <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" /> Email me a sign-in link
      </Button>
    );

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border bg-muted/30 p-4">
      {error && <Alert variant="error">{error}</Alert>}
      <Field id="magic-email" label="We'll email you a link to sign in instantly">
        <Input id="magic-email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </Field>
      {captcha.field}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" loading={loading} disabled={!email}>
          Send link
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Login-page slot: request a passwordless sign-in link. */
export function MagicLinkForm({ mode }: { mode: 'login' | 'register' }) {
  if (mode !== 'login') return null;
  return (
    <Suspense>
      <MagicLink />
    </Suspense>
  );
}
