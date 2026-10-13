import Link from 'next/link';
import type { SVGProps } from 'react';
import { appName, cn } from '@/lib/utils';

/** Brand mark: a cow head drawn in the same stroke style as the lucide icons. */
export function CowMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M8.2 6.6C6.6 6.3 5.7 5.1 5.6 3.4" />
      <path d="M15.8 6.6c1.6-.3 2.5-1.5 2.6-3.2" />
      <path d="M7.2 8.3C5.4 7.5 3.4 7.9 2.4 9.3c1.2 1.2 3.2 1.4 4.9.6" />
      <path d="M16.8 8.3c1.8-.8 3.8-.4 4.8 1-1.2 1.2-3.2 1.4-4.9.6" />
      <path d="M7.3 12.9 6.7 8.3A1.6 1.6 0 0 1 8.3 6.5h7.4a1.6 1.6 0 0 1 1.6 1.8l-.6 4.6" />
      <rect x="6.6" y="12.6" width="10.8" height="7.6" rx="3.8" />
      <circle cx="9.7" cy="10" r=".5" fill="currentColor" />
      <circle cx="14.3" cy="10" r=".5" fill="currentColor" />
      <circle cx="10.2" cy="16.4" r=".6" fill="currentColor" />
      <circle cx="13.8" cy="16.4" r=".6" fill="currentColor" />
    </svg>
  );
}

export function LogoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-emerald-700 text-white shadow-sm shadow-primary/30 ring-1 ring-white/10',
        className,
      )}
    >
      <CowMark className="h-5 w-5" />
    </span>
  );
}

export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2.5 font-semibold tracking-tight', className)}>
      <LogoBadge />
      <span className="text-[17px]">{appName}</span>
    </Link>
  );
}
