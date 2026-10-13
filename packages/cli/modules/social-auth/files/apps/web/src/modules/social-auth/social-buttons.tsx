'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { buttonClasses } from '@/components/ui/button';
import { providerIcons } from './icons';
import { useProviders } from './use-providers';

function Buttons({ mode }: { mode: 'login' | 'register' }) {
  const providers = useProviders();
  const next = useSearchParams().get('next') ?? '/dashboard';
  if (!providers?.length) return null;
  return (
    <>
      {/* Up to two providers get full-width buttons; more become a compact icon grid. */}
      <div className={providers.length > 2 ? 'grid grid-cols-4 gap-2' : 'grid gap-2'}>
        {providers.map((p) => {
          const Icon = providerIcons[p.id];
          const label = `${mode === 'register' ? 'Sign up' : 'Continue'} with ${p.name}`;
          return (
            // Full-page navigation: the API redirects to the provider.
            <a
              key={p.id}
              href={`/api/oauth/${p.id}?next=${encodeURIComponent(next)}`}
              className={buttonClasses('outline', 'md', 'w-full')}
              title={label}
              aria-label={label}
            >
              {Icon && <Icon className={providers.length > 2 ? 'h-5 w-5' : 'h-4 w-4'} />}
              {providers.length <= 2 && label}
            </a>
          );
        })}
      </div>
    </>
  );
}

export function SocialButtons(props: { mode: 'login' | 'register' }) {
  return (
    <Suspense>
      <Buttons {...props} />
    </Suspense>
  );
}
