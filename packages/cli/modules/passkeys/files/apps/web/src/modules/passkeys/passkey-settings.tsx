'use client';

import { useCallback, useEffect, useState } from 'react';
import { startRegistration, browserSupportsWebAuthn, WebAuthnError } from '@simplewebauthn/browser';
import { Fingerprint, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PublicUser } from '@kit/shared';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

interface PasskeyInfo {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Friendly messages for the errors a user can actually cause. */
export function passkeyError(err: unknown): string | null {
  if (err instanceof WebAuthnError) {
    if (err.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'This device already has a passkey for your account.';
    if (err.code === 'ERROR_CEREMONY_ABORTED') return null;
  }
  if (err instanceof Error && err.name === 'NotAllowedError') return null; // user cancelled
  return errorMessage(err);
}

export function PasskeySettings({ user: _user }: { user: PublicUser }) {
  const [items, setItems] = useState<PasskeyInfo[] | null>(null);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => {
    api
      .get<{ passkeys: PasskeyInfo[] }>('/passkeys')
      .then((r) => setItems(r.passkeys))
      .catch((err) => toast.error(errorMessage(err)));
  }, []);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    load();
  }, [load]);

  const add = async () => {
    setBusy('add');
    try {
      const optionsJSON = await api.post<Parameters<typeof startRegistration>[0]['optionsJSON']>('/passkeys/register/options');
      const response = await startRegistration({ optionsJSON });
      await api.post('/passkeys/register/verify', { response });
      toast.success('Passkey added — you can now sign in without a password');
      load();
    } catch (err) {
      const message = passkeyError(err);
      if (message) toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const rename = async () => {
    if (!editing) return;
    setBusy(editing.id);
    try {
      await api.patch(`/passkeys/${encodeURIComponent(editing.id)}`, { name: editing.name });
      setEditing(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: PasskeyInfo) => {
    if (!confirm(`Remove "${p.name}"? You won't be able to sign in with it anymore.`)) return;
    setBusy(p.id);
    try {
      await api.delete(`/passkeys/${encodeURIComponent(p.id)}`);
      toast.success('Passkey removed');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 sm:flex">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-primary" />
            <CardTitle>Passkeys</CardTitle>
          </div>
          <CardDescription>Sign in with Face ID, Touch ID, Windows Hello or a security key — no password needed.</CardDescription>
        </div>
        <Button onClick={add} loading={busy === 'add'} disabled={!supported}>
          Add passkey
        </Button>
      </CardHeader>
      <CardContent>
        {!supported && <Alert variant="info">This browser doesn&apos;t support passkeys.</Alert>}
        {items && items.length === 0 && <p className="text-sm text-muted-foreground">You haven&apos;t added any passkeys yet.</p>}
        {items && items.length > 0 && (
          <ul className="divide-y">
            {items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <KeyRound className="h-5 w-5 text-muted-foreground" />
                  {editing?.id === p.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void rename();
                      }}
                      className="flex gap-2"
                    >
                      <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-8" maxLength={100} autoFocus />
                      <Button size="sm" type="submit" loading={busy === p.id}>
                        Save
                      </Button>
                    </form>
                  ) : (
                    <div className="text-sm">
                      <p className="font-medium">
                        {p.name} {p.backedUp && <Badge className="ml-1">Synced</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Added {new Date(p.createdAt).toLocaleDateString()} ·{' '}
                        {p.lastUsedAt ? `last used ${new Date(p.lastUsedAt).toLocaleDateString()}` : 'never used'}
                      </p>
                    </div>
                  )}
                </div>
                {editing?.id !== p.id && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Rename ${p.name}`} onClick={() => setEditing({ id: p.id, name: p.name })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Remove ${p.name}`} loading={busy === p.id} onClick={() => remove(p)}>
                      {busy !== p.id && <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
