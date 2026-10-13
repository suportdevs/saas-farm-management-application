'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { PublicUser } from '@kit/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { BackupCodes } from './backup-codes';

type Step =
  | { kind: 'idle' }
  | { kind: 'password' }
  | { kind: 'scan'; qrCode: string; secret: string }
  | { kind: 'codes'; codes: string[] }
  | { kind: 'confirm'; action: 'disable' | 'regenerate' };

export function TwoFactorSettings({ user }: { user: PublicUser }) {
  const router = useRouter();
  const enabled = Boolean(user.twoFactorEnabled);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
      setValue('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const startSetup = (password?: string) =>
    run(async () => {
      const res = await api.post<{ qrCode: string; secret: string }>('/two-factor/setup', { password });
      setStep({ kind: 'scan', ...res });
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step.kind === 'password') return startSetup(value);
    if (step.kind === 'scan')
      return run(async () => {
        const { backupCodes } = await api.post<{ backupCodes: string[] }>('/two-factor/enable', { code: value });
        toast.success('Two-factor authentication enabled');
        setStep({ kind: 'codes', codes: backupCodes });
      });
    if (step.kind === 'confirm' && step.action === 'disable')
      return run(async () => {
        await api.post('/two-factor/disable', { code: value });
        toast.success('Two-factor authentication disabled');
        setStep({ kind: 'idle' });
        router.refresh();
      });
    if (step.kind === 'confirm' && step.action === 'regenerate')
      return run(async () => {
        const { backupCodes } = await api.post<{ backupCodes: string[] }>('/two-factor/backup-codes', { code: value });
        setStep({ kind: 'codes', codes: backupCodes });
      });
  };

  const cancel = () => {
    setStep({ kind: 'idle' });
    setValue('');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <CardTitle>Two-factor authentication</CardTitle>
          {enabled ? <Badge variant="success">Enabled</Badge> : <Badge>Disabled</Badge>}
        </div>
        <CardDescription>
          Protect your account with a one-time code from an authenticator app such as Google Authenticator, 1Password or Authy.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step.kind === 'idle' &&
          (enabled ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep({ kind: 'confirm', action: 'regenerate' })}>
                Regenerate backup codes
              </Button>
              <Button variant="destructive" onClick={() => setStep({ kind: 'confirm', action: 'disable' })}>
                Disable 2FA
              </Button>
            </div>
          ) : (
            <Button onClick={() => (user.hasPassword ? setStep({ kind: 'password' }) : startSetup())} loading={loading}>
              Enable 2FA
            </Button>
          ))}

        {step.kind === 'codes' && (
          <BackupCodes
            codes={step.codes}
            onDone={() => {
              setStep({ kind: 'idle' });
              router.refresh();
            }}
          />
        )}

        {(step.kind === 'password' || step.kind === 'scan' || step.kind === 'confirm') && (
          <form onSubmit={submit} className="space-y-4">
            {step.kind === 'scan' && (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={step.qrCode} alt="QR code for your authenticator app" className="h-44 w-44 rounded-lg border bg-white p-2" />
                <div className="space-y-2 text-sm">
                  <p>1. Scan this QR code with your authenticator app.</p>
                  <p className="text-muted-foreground">
                    Can&apos;t scan? Enter this key manually:
                    <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">{step.secret}</code>
                  </p>
                  <p>2. Enter the 6-digit code it shows below.</p>
                </div>
              </div>
            )}
            {step.kind === 'password' ? (
              <Field id="tf-password" label="Confirm your password to continue">
                <Input id="tf-password" type="password" autoComplete="current-password" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
              </Field>
            ) : (
              <Field
                id="tf-code"
                label={step.kind === 'scan' ? 'Verification code' : 'Enter a code from your app (or a backup code)'}
              >
                <Input
                  id="tf-code"
                  inputMode={step.kind === 'scan' ? 'numeric' : 'text'}
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="max-w-48 font-mono tracking-widest"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoFocus
                />
              </Field>
            )}
            <div className="flex gap-2">
              <Button type="submit" loading={loading} disabled={!value} variant={step.kind === 'confirm' && step.action === 'disable' ? 'destructive' : 'primary'}>
                {step.kind === 'password' ? 'Continue' : step.kind === 'scan' ? 'Verify & enable' : step.action === 'disable' ? 'Disable 2FA' : 'Regenerate codes'}
              </Button>
              <Button type="button" variant="ghost" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
