import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'SaaS Kit';
/** Public URL of the site, used for canonical links, sitemap and Open Graph. */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
