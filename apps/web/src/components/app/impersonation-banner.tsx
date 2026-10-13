'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UserCog } from 'lucide-react';
import { toast } from 'sonner';
import type { Impersonator } from '@kit/shared';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';

export function ImpersonationBanner({ impersonator, userName }: { impersonator: Impersonator; userName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const stop = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ redirect: string }>('/auth/impersonation/stop');
      router.push(res.redirect);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setLoading(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-6 py-2 text-sm font-medium text-amber-950">
      <span className="flex items-center gap-2">
        <UserCog className="h-4 w-4" />
        You ({impersonator.email}) are signed in as <strong>{userName}</strong>. Some account actions are disabled.
      </span>
      <Button size="sm" variant="outline" onClick={stop} loading={loading} className="border-amber-950/30 bg-amber-50 text-amber-950 hover:bg-amber-100">
        Stop impersonating
      </Button>
    </div>
  );
}
