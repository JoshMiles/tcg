import type { Metadata, Viewport } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';
import { ServiceWorker } from './components/ServiceWorker';

const display = Fredoka({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700'] });
const body = Nunito({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Link previews (Discord, Twitter, iMessage...). Pages inherit these; the share image is app/opengraph-image.tsx.
  openGraph: { type: 'website', siteName: SITE_NAME },
  twitter: { card: 'summary_large_image' },
  // iOS: open without Safari's toolbars once added (the home-screen icon is app/apple-icon.png).
  appleWebApp: { capable: true, title: 'Cheesy TCG', statusBarStyle: 'black' },
  // A plain, hash-free apple-touch link (the opaque PNG in public/); iOS has been seen to keep a stale icon behind a ?query.
  // The tab icon is listed here too: setting `icons` switches off a file-based app/icon.png, so the favicon lives in public/ (favicon.ico is also fetched directly by Discord and RSS readers).
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/favicon.png', type: 'image/png', sizes: '224x224' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
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
