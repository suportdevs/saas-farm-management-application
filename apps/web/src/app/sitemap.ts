import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/utils';
import { publicNavItems } from '@/modules/registry';

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ['/', '/pricing', ...publicNavItems.map((i) => i.href), '/login', '/register', '/terms', '/privacy'];
  return [...new Set(paths)].map((path) => ({
    url: `${siteUrl}${path === '/' ? '' : path}`,
    changeFrequency: 'monthly',
    priority: path === '/' ? 1 : 0.6,
  }));
}
