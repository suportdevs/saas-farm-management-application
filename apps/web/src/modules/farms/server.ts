import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { FarmContext, FarmSummary } from '@kit/shared';
import { serverFetch } from '@/lib/session';

/** The signed-in user's farms, most recently used first. De-duplicated per request. */
export const getFarms = cache(async (): Promise<FarmSummary[]> => {
  const res = await serverFetch<{ farms: FarmSummary[] }>('/farms');
  return res?.farms ?? [];
});

/** Everything a farm workspace page needs. 404s for non-members. */
export const getFarmContext = cache(async (slug: string): Promise<FarmContext> => {
  const ctx = await serverFetch<FarmContext>(`/farms/${encodeURIComponent(slug)}`);
  if (!ctx) notFound();
  return ctx;
});
