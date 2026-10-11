import type { Metadata } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

const display = Fredoka({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700'] });
const body = Nunito({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: { default: 'The Cheesy TCG', template: '%s · The Cheesy TCG' },
  description: 'A cheesy collectible card game played live on the Cheesygidds Twitch channel. Pull cards, collect every variant, climb the leaderboard.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-sans text-white min-h-screen">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
