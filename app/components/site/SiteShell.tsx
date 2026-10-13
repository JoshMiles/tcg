import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteNav, type NavRank, type NavUser } from './SiteNav';
import { SiteSearch } from './SiteSearch';
import { getActiveSeason } from '@/lib/kv';
import { getSeasonLeaderboardCached } from '@/lib/leaderboard';
import { CHANNEL_NAME, CHANNEL_URL } from '@/lib/site';
import { getLiveStatus } from '@/lib/twitch-live';
import { LiveProvider } from './Live';
import { getSession, loginConfigured } from '@/lib/session';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { getUserSettings } from '@/lib/user-settings-store';
import { DEFAULT_SETTINGS, hasExperiment } from '@/lib/user-settings';
import { PublicKeyboard } from './PublicKeyboard';
import { CaptchaHost } from '@/app/components/CaptchaHost';
import { CookieNotice,CookieSettingsLink } from './CookieNotice';
import { SandboxPill } from '@/app/components/SandboxPill';

/** Nav bar + footer around every public page (home, collections, leaderboard, stats, card dex, legal). */
export async function SiteShell({ children }: { children: ReactNode }) {
  const session = await getSession();
  const live = await getLiveStatus().catch(() => null); // cached, so this is normally one KV read
  let user: NavUser | null = null;
  let rank: NavRank | null = null;
  const prefs = session ? await getUserSettings(session.username) : DEFAULT_SETTINGS;
  if (session) {
    const avatar = (await getAvatars([session.username]))[session.username];
    user = { username: session.username, displayName: session.displayName, avatarUrl: avatar && sizeTwitchAvatar(avatar, 70) };
    // Their place in the active season, from the shared (20 s) board: a nice-to-have, so a failure just hides the chip.
    try {
      const season = await getActiveSeason();
      if (season) {
        const board = await getSeasonLeaderboardCached(season);
        const i = board.rows.findIndex(r => r.username === session.username);
        if (i >= 0) rank = { rank: i + 1, score: Math.round(board.rows[i].score), total: board.rows.length, season: season.name };
      }
    } catch { /* leave the chip out */ }
  }

  return (
    <LiveProvider initial={live}>
    <div className="min-h-screen flex flex-col" data-motion={prefs.motion}>
      {hasExperiment(prefs, 'shortcuts') && <PublicKeyboard username={session?.username} />}
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[90] focus:rounded-xl focus:bg-yellow-400 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-gray-950">Skip to content</a>
      <SandboxPill />
      <CookieNotice />
      <CaptchaHost />
      <SiteNav user={user} loginEnabled={loginConfigured()} rank={rank} />
      <SiteSearch />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
      <footer className="border-t border-gray-800/80 bg-gray-950/60 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-8 grid gap-6 sm:grid-cols-[1fr_auto] items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <img src="/brand/icon.png" alt="" width={28} height={28} className="rounded-md ring-1 ring-yellow-500/40" />
              <span className="font-display font-bold text-yellow-300">The Cheesy TCG</span>
            </div>
            <p className="text-xs text-gray-500 max-w-md leading-relaxed">
              A cheesy collectible card game played live on <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="text-yellow-500 hover:text-yellow-300 underline">{CHANNEL_NAME}&rsquo;s Twitch channel</a> — and nowhere else. Fan-made and not affiliated with or endorsed by Twitch.
            </p>
            <p className="text-xs text-gray-500 max-w-md leading-relaxed">
              Cards are virtual trading cards for fun — not NFTs, not crypto, and with no real-world value.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-400" aria-label="Footer">
            <Link href="/collection" className="hover:text-white transition-colors">Collections</Link>
            <Link href="/leaderboard" className="hover:text-white transition-colors">Leaderboard</Link>
            <Link href="/stats" className="hover:text-white transition-colors">Season Stats</Link>
            <Link href="/cards" className="hover:text-white transition-colors">Card Dex</Link>
            <Link href="/faq" className="hover:text-white transition-colors">FAQ</Link>
            <Link href="/install" className="hover:text-white transition-colors">Get the app</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <CookieSettingsLink />
          </nav>
        </div>
      </footer>
    </div>
    </LiveProvider>
  );
}
