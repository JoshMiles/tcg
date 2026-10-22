import { BetaBanner } from './BetaBanner';
import { bannerText, getSiteLabel } from '@/lib/site-label';
import { requireSiteAccess } from '@/lib/access';
import { ClosedShell } from './ClosedShell';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteNav, type NavRank, type NavUser } from './SiteNav';
import { SiteSearch } from './SiteSearch';
import { getActiveSeason } from '@/lib/kv';
import { getSeasonLeaderboardCached } from '@/lib/leaderboard';
import { CHANNEL_NAME, CHANNEL_URL, reportProblemUrl } from '@/lib/site';
import { getLiveStatus } from '@/lib/twitch-live';
import { LiveProvider } from './Live';
import { getSession, loginConfigured } from '@/lib/session';
import { staffPanelLink } from '@/lib/staff-guard';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { getUserSettings } from '@/lib/user-settings-store';
import { DEFAULT_SETTINGS, hasExperiment } from '@/lib/user-settings';
import { PublicKeyboard } from './PublicKeyboard';
import { CaptchaHost } from '@/app/components/CaptchaHost';
import { CookieNotice,CookieSettingsLink } from './CookieNotice';
import { ChangelogLink } from './ChangelogLink';
import { newestChangelogDate } from '@/lib/changelog';
import { PullToRefresh } from './PullToRefresh';
import { SandboxPill } from '@/app/components/SandboxPill';

/** Nav bar + footer around every public page (home, collections, leaderboard, stats, card dex, legal). */
export async function SiteShell({ children }: { children: ReactNode }) {
  // The closed alpha / beta gate's authoritative check (lib/access.ts). Privacy and terms stay readable for everyone, but someone who
  // can't use the site gets them without the nav, search and site links.
  if (!(await requireSiteAccess())) return <ClosedShell>{children}</ClosedShell>;

  const session = await getSession();
  const siteLabel = await getSiteLabel();
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
    <div className="site-touch min-h-screen flex flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] xl:pb-0" data-motion={prefs.motion}>
      {hasExperiment(prefs, 'shortcuts') && <PublicKeyboard username={session?.username} />}
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-90 focus:rounded-xl focus:bg-yellow-400 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-gray-950">Skip to content</a>
      <SandboxPill />
      {siteLabel.label && <BetaBanner text={bannerText(siteLabel)} />}
      <CookieNotice />
      <CaptchaHost />
      <PullToRefresh />
      <SiteNav label={siteLabel.label} user={user} loginEnabled={loginConfigured()} rank={rank} staff={await staffPanelLink(session).catch(() => null)} />
      <SiteSearch />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-hidden">{children}</main>
      <footer className="border-t border-gray-800/80 bg-gray-950/60 mt-12 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-6xl mx-auto px-4 pt-8 pb-6">
          <div className="grid gap-8 md:grid-cols-[minmax(0,20rem)_1fr] md:gap-10 items-start">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <img src="/brand/icon.png" alt="" width={28} height={28} className="rounded-md ring-1 ring-yellow-500/40" />
                <span className="font-display font-bold text-yellow-300 whitespace-nowrap">The Cheesy TCG</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                A cheesy collectible card game played live on <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="text-yellow-500 hover:text-yellow-300 underline">{CHANNEL_NAME}&rsquo;s Twitch channel</a>, and nowhere else. Fan-made and not affiliated with or endorsed by Twitch.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
              <nav aria-label="Play">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">Play</h2>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li><Link href="/collection" className="hover:text-white transition-colors">Collectors</Link></li>
                  <li><Link href="/leaderboard" className="hover:text-white transition-colors">Leaderboard</Link></li>
                  <li><Link href="/stats" className="hover:text-white transition-colors">Season Stats</Link></li>
                  <li><Link href="/cards" className="hover:text-white transition-colors">Card Dex</Link></li>
                </ul>
              </nav>
              <nav aria-label="Help">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">Help</h2>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li><Link href="/faq" className="hover:text-white transition-colors">FAQ</Link></li>
                  <li><Link href="/install" className="hover:text-white transition-colors">Get the app</Link></li>
                  <li><ChangelogLink newest={newestChangelogDate()} className="hover:text-white transition-colors">What&rsquo;s new</ChangelogLink></li>
                  <li><Link href="/feedback?kind=idea" className="hover:text-white transition-colors">Suggest something</Link></li>
                  <li><a href={reportProblemUrl()} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Report a problem</a></li>
                </ul>
              </nav>
              <nav aria-label="Legal">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">Legal</h2>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link></li>
                  <li><Link href="/terms" className="hover:text-white transition-colors">Terms</Link></li>
                  <li><CookieSettingsLink /></li>
                </ul>
              </nav>
            </div>
          </div>
          <p className="border-t border-gray-800/60 mt-8 pt-4 text-xs text-gray-600 leading-relaxed">
            Cards are virtual trading cards for fun. Not NFTs, not crypto, and with no real-world value.
          </p>
        </div>
      </footer>
    </div>
    </LiveProvider>
  );
}
