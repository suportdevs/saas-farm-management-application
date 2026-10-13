'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, Copy, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

interface ReferralData {
  code: string;
  url: string;
  stats: { signups: number; verified: number };
  referrals: { name: string; joinedAt: string; verified: boolean }[];
}

/** Invitation link + stats. `compact` is the dashboard version; the full one lists sign-ups. */
export function ReferralCard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<ReferralData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get<ReferralData>('/referrals/me')
      .then(setData)
      .catch((err) => toast.error(errorMessage(err)));
  }, []);

  const copy = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(data.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 sm:flex">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            <CardTitle>Invite friends</CardTitle>
          </div>
          <CardDescription>Share your personal link — everyone who signs up with it is credited to you.</CardDescription>
        </div>
        {compact && (
          <Link href="/settings/referrals" className="shrink-0 text-sm text-primary hover:underline">
            Details
          </Link>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-2">
          <Input readOnly value={data?.url ?? 'Loading…'} onFocus={(e) => e.target.select()} aria-label="Your invitation link" className="font-mono text-xs" />
          <Button type="button" variant="outline" onClick={copy} disabled={!data} className="shrink-0">
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Sign-ups</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{data?.stats.signups ?? '—'}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Verified</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{data?.stats.verified ?? '—'}</p>
          </div>
        </div>

        {!compact && data && (
          <div>
            <h4 className="mb-2 text-sm font-medium">Recent sign-ups</h4>
            {data.referrals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody has joined with your link yet.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {data.referrals.map((r, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span>{r.name}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.verified ? <Badge variant="success">Verified</Badge> : <Badge>Pending</Badge>}
                      {new Date(r.joinedAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReferralWidget() {
  return <ReferralCard compact />;
}
