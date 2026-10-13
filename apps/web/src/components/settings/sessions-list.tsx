'use client';

import { useCallback, useEffect, useState } from 'react';
import { Laptop, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import type { SessionInfo } from '@kit/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';
import { describeAgent } from '@/lib/audit';

export function SessionsList() {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ sessions: SessionInfo[] }>('/auth/sessions');
      setSessions(res.sessions);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (id?: string) => {
    try {
      await api.delete(id ? `/auth/sessions/${id}` : '/auth/sessions');
      toast.success(id ? 'Session revoked' : 'Signed out of all other sessions');
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const others = sessions?.filter((s) => !s.current).length ?? 0;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 sm:flex">
        <div className="space-y-1.5">
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>Devices currently signed in to your account.</CardDescription>
        </div>
        {others > 0 && (
          <Button variant="outline" size="sm" onClick={() => revoke()}>
            Sign out others
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!sessions ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="divide-y">
            {sessions.map((s) => {
              const { label, mobile } = describeAgent(s.userAgent);
              const Icon = mobile ? Smartphone : Laptop;
              return (
                <li key={s.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div className="text-sm">
                      <p className="font-medium">
                        {label} {s.current && <Badge variant="success" className="ml-1">This device</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.ip ?? 'Unknown IP'} · Last active {new Date(s.lastSeenAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {!s.current && (
                    <Button variant="ghost" size="sm" onClick={() => revoke(s.id)}>
                      Revoke
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
