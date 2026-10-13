'use client';

import { useEffect, useState } from 'react';
import type { AppFeatures } from '@kit/shared';
import { api } from './api';

let cache: Promise<AppFeatures | null> | null = null;

/** GET /api/features, fetched once per page load and shared by every caller. */
export function useFeatures(): AppFeatures | null {
  const [features, setFeatures] = useState<AppFeatures | null>(null);
  useEffect(() => {
    cache ??= api.get<AppFeatures>('/features').catch(() => null);
    let active = true;
    void cache.then((f) => active && setFeatures(f));
    return () => {
      active = false;
    };
  }, []);
  return features;
}
