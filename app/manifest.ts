import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo';

// Lets a phone "Add to home screen" the site like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME, short_name: 'Cheesy TCG', description: SITE_DESCRIPTION, start_url: '/', display: 'standalone',
    background_color: '#0a0f1e', theme_color: '#0a0f1e',
    icons: [{ src: '/brand/icon.png', sizes: 'any', type: 'image/png' }],
  };
}
