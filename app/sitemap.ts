import type { MetadataRoute } from 'next';
import { getAccessSettings } from '@/lib/access';
import { listSeasons } from '@/lib/kv';
import { buildSitemap } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [seasons, settings] = await Promise.all([listSeasons().catch(() => []), getAccessSettings()]);
  return buildSitemap(SITE_URL, seasons, new Date(), settings.mode !== 'open');
}
