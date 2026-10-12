import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://human-oracle.vercel.app');
  return ['', '/about', '/how-it-works', '/privacy', '/terms', '/community-guidelines']
    .map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: path ? 'monthly' as const : 'weekly' as const }));
}
