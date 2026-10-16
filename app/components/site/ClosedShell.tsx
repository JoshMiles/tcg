import Link from 'next/link';
import type { ReactNode } from 'react';
import { CookieNotice, CookieSettingsLink } from './CookieNotice';
import { CHANNEL_NAME, CHANNEL_URL } from '@/lib/site';

/**
 * The bare frame for the pages that stay open while the site is closed to testers (privacy, terms), shown to someone who can't use
 * the site: the name, the page and the legal links. No nav, search, live status or links into the rest of the site.
 */
export function ClosedShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[90] focus:rounded-xl focus:bg-yellow-400 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-gray-950">Skip to content</a>
      <CookieNotice />
      <header className="border-b border-gray-800/80 bg-gray-950/60">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/closed" className="flex items-center gap-2.5 min-w-0" aria-label="The Cheesy TCG">
            <img src="/brand/icon.png" alt="" width={28} height={28} className="rounded-md ring-1 ring-yellow-500/40" />
            <span className="font-display font-bold text-yellow-300 truncate">The Cheesy TCG</span>
          </Link>
          <Link href="/closed" className="shrink-0 text-xs font-semibold text-yellow-500 hover:text-yellow-300">Log in</Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
      <footer className="border-t border-gray-800/80 bg-gray-950/60 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-gray-500">
          <p>Played live on <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="text-yellow-500 hover:text-yellow-300 underline">{CHANNEL_NAME}&rsquo;s Twitch channel</a>, and nowhere else.</p>
          <nav aria-label="Legal" className="flex gap-4">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <CookieSettingsLink />
          </nav>
        </div>
      </footer>
    </div>
  );
}
