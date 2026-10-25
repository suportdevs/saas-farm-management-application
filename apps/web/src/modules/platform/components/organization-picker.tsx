'use client';

import { useEffect, useState } from 'react';
import { Building2, Check } from 'lucide-react';
import type { PlatformOrganization } from '@kit/shared';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Search the client organizations by name or owner email and pick one. */
export function OrganizationPicker({ value, onChange }: { value: PlatformOrganization | null; onChange: (org: PlatformOrganization) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlatformOrganization[]>([]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      api
        .get<{ organizations: PlatformOrganization[] }>(`/admin/organizations?pageSize=8${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`)
        .then((r) => active && setResults(r.organizations))
        .catch(() => active && setResults([]));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q]);

  return (
    <div className="space-y-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search organization or owner email…" aria-label="Search organizations" />
      <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
        {results.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">No organizations match.</li>}
        {results.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onChange(o)}
              className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50', value?.id === o.id && 'bg-primary/5')}
            >
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{o.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {o.owner?.email ?? 'No owner yet'} · {o.farmCount} {o.farmCount === 1 ? 'farm' : 'farms'}
                </span>
              </span>
              {value?.id === o.id && <Check className="h-4 w-4 text-primary" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
