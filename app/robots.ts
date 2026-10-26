import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { getAccessSettings } from '@/lib/access';
import { DISALLOWED_PATHS } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection(); // the closed alpha / beta changes what crawlers may see
  const settings = await getAccessSettings();
  // While the site is closed, only the pages that stay open to everyone may be crawled.
  if (settings.mode !== 'open') return { rules: [{ userAgent: '*', allow: ['/privacy', '/terms'], disallow: '/' }], sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL };
  return { rules: [{ userAgent: '*', allow: '/', disallow: DISALLOWED_PATHS }], sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL };
}
