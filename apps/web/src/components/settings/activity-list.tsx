'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AuditLogEntry } from '@kit/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';
import { actionLabel, describeAgent } from '@/lib/audit';

export function ActivityList() {
  const [events, setEvents] = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    api
      .get<{ events: AuditLogEntry[] }>('/users/me/activity?pageSize=15')
      .then((res) => setEvents(res.events))
      .catch((err) => toast.error(errorMessage(err)));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent security activity</CardTitle>
        <CardDescription>Sign-ins and changes to your account. Don&apos;t recognise something? Change your password.</CardDescription>
      </CardHeader>
      <CardContent>
        {!events ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ul className="divide-y">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="font-medium">{actionLabel(e.action)}</span>
                <span className="text-xs text-muted-foreground">
                  {describeAgent(e.userAgent).label} · {e.ip ?? 'unknown IP'} · {new Date(e.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
