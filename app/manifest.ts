import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo';

// Lets a phone "Add to home screen" the site like an app (see /install). Chrome wants 192 and 512 px icons, and Android crops
// "maskable" ones to a circle or squircle, so those carry extra margin.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: SITE_NAME,
    short_name: 'Cheesy TCG',
    description: SITE_DESCRIPTION,
    lang: 'en',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0f1e',
    theme_color: '#0a0f1e',
    categories: ['games', 'entertainment'],
    icons: [
      { src: '/apple-touch-icon-v3.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Phone screenshots (taken from seeded mock data) so Chrome on Android shows the richer install sheet.
    screenshots: [
      { src: '/screenshots/install-1.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Home: top collectors and the live season' },
      { src: '/screenshots/install-2.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Card dex: every card and how rare it is' },
      { src: '/screenshots/install-3.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'A collector profile with rank and score' },
    ],
    shortcuts: [
      { name: 'My stats', short_name: 'My stats', url: '/account?source=pwa', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Trade', url: '/trade?source=pwa', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Leaderboard', url: '/leaderboard?source=pwa', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Card Dex', url: '/cards?source=pwa', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
