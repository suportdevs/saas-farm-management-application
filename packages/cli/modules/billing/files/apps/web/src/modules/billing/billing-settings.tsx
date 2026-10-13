'use client';

import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';
import type { SubscriptionResponse } from './types';

const statusLabels: Record<string, { label: string; variant: 'success' | 'destructive' | 'default' | 'primary' }> = {
  active: { label: 'Active', variant: 'success' },
  trialing: { label: 'Trial', variant: 'primary' },
  past_due: { label: 'Payment overdue', variant: 'destructive' },
};

export function BillingSettings({ data, checkout }: { data: SubscriptionResponse; checkout?: string }) {
  const [loading, setLoading] = useState(false);
  const { plan, subscription } = data;

  const openPortal = async () => {
    setLoading(true);
    try {
      const { url } = await api.post<{ url: string }>('/billing/portal');
      window.location.href = url;
    } catch (err) {
      toast.error(errorMessage(err));
      setLoading(false);
    }
  };

  const status = subscription ? statusLabels[subscription.status] : null;
  const date = (v: string | null) => (v ? new Date(v).toLocaleDateString() : null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <CardTitle>Current plan: {plan.name}</CardTitle>
          {status && <Badge variant={status.variant}>{status.label}</Badge>}
        </div>
        <CardDescription>
          {!subscription
            ? 'You are on the free plan. Upgrade any time below.'
            : subscription.cancelAtPeriodEnd
              ? `Your subscription ends on ${date(subscription.currentPeriodEnd)}.`
              : subscription.status === 'trialing'
                ? `Your trial ends on ${date(subscription.trialEnd)}.`
                : `Renews ${subscription.interval === 'year' ? 'yearly' : 'monthly'} on ${date(subscription.currentPeriodEnd)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {checkout === 'success' && (
          <Alert variant="success">Thanks for subscribing! It can take a few seconds for your new plan to show up.</Alert>
        )}
        {subscription?.status === 'past_due' && (
          <Alert variant="error">Your last payment failed. Update your payment method to keep your plan.</Alert>
        )}
        {!data.enabled && <Alert variant="info">Billing isn&apos;t configured yet — set STRIPE_SECRET_KEY on the API.</Alert>}
        {subscription && (
          <Button variant="outline" onClick={openPortal} loading={loading}>
            Manage billing & invoices
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
