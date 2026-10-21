import type { Metadata, Viewport } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';
import { ServiceWorker } from './components/ServiceWorker';

const display = Fredoka({ subsets: ['latin'], variable: '--font-display-family', weight: ['500', '600', '700'] });
const body = Nunito({ subsets: ['latin'], variable: '--font-body' });

// [CSS width, CSS height, pixel ratio]; keep in step with SPLASH in scripts/make-pwa-icons.mjs.
const IPHONE_SCREENS = [[375, 667, 2], [414, 896, 2], [375, 812, 3], [414, 896, 3], [390, 844, 3], [428, 926, 3], [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3]];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Link previews (Discord, Twitter, iMessage...). Pages inherit these; the share image is app/opengraph-image.tsx.
  openGraph: { type: 'website', siteName: SITE_NAME },
  twitter: { card: 'summary_large_image' },
  // iOS: open without Safari's toolbars once added (the home-screen icon is public/apple-touch-icon-v3.png).
  // startupImage is the launch screen (no white flash): one portrait image per iPhone screen, made by scripts/make-pwa-icons.mjs.
  appleWebApp: {
    capable: true,
    title: 'Cheesy TCG',
    statusBarStyle: 'black',
    startupImage: IPHONE_SCREENS.map(([w, h, r]) => ({
      url: `/splash/${w}x${h}@${r}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
    })),
  },
  // A plain, hash-free apple-touch link (the opaque PNG in public/). iOS caches the icon per URL and has kept a stale one behind a ?query, so a changed icon gets a new file name (-v3); the root apple-touch-icon.png and -precomposed.png stay for iOS's direct probes.
  // The tab icon is listed here too: setting `icons` switches off a file-based app/icon.png, so the favicon lives in public/ (favicon.ico is also fetched directly by Discord and RSS readers).
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/favicon.png', type: 'image/png', sizes: '224x224' },
    ],
    apple: [{ url: '/apple-touch-icon-v3.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: '#0a0f1e', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-sans text-white min-h-screen">
        {children}
        <ServiceWorker />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
