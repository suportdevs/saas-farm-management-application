'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface Provider {
  id: string;
  name: string;
}

let cache: Promise<Provider[]> | null = null;

/** Configured OAuth providers (fetched once per page load). */
export function useProviders(): Provider[] | null {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  useEffect(() => {
    cache ??= api
      .get<{ providers: Provider[] }>('/oauth/providers')
      .then((r) => r.providers)
      .catch(() => []);
    let active = true;
    cache.then((p) => active && setProviders(p));
    return () => {
      active = false;
    };
  }, []);
  return providers;
}
