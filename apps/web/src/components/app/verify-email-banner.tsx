'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';

export function VerifyEmailBanner({ email }: { email: string }) {
  const [loading, setLoading] = useState(false);
  const resend = async () => {
    setLoading(true);
    try {
      await api.post('/auth/verify-email/resend');
      toast.success(`Verification email sent to ${email}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2.5 text-sm">
      <span>Please verify your email address. Check your inbox for <strong>{email}</strong>.</span>
      <Button variant="link" size="sm" onClick={resend} loading={loading}>
        Resend email
      </Button>
    </div>
  );
}
