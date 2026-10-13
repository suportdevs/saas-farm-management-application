import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/utils';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard', '/settings', '/admin', '/orgs', '/farms', '/onboarding', '/invite'] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
