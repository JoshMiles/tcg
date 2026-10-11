import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteNav, type NavUser } from './SiteNav';
import { getSession, loginConfigured } from '@/lib/session';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';

/** Nav bar + footer around every public page (home, collections, leaderboard, stats, card dex, legal). */
export async function SiteShell({ children }: { children: ReactNode }) {
  const session = await getSession();
  let user: NavUser | null = null;
  if (session) {
    const avatar = (await getAvatars([session.username]))[session.username];
    user = { username: session.username, displayName: session.displayName, avatarUrl: avatar && sizeTwitchAvatar(avatar, 70) };
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav user={user} loginEnabled={loginConfigured()} />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-gray-800/80 bg-gray-950/60 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-8 grid gap-6 sm:grid-cols-[1fr_auto] items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <img src="/brand/icon.png" alt="" width={28} height={28} className="rounded-md ring-1 ring-yellow-500/40" />
              <span className="font-display font-bold text-yellow-300">The Cheesy TCG</span>
            </div>
            <p className="text-xs text-gray-500 max-w-md leading-relaxed">
              A cheesy collectible card game played live on Twitch. Fan-made and not affiliated with or endorsed by Twitch.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-400" aria-label="Footer">
            <Link href="/collection" className="hover:text-white transition-colors">Collections</Link>
            <Link href="/leaderboard" className="hover:text-white transition-colors">Leaderboard</Link>
            <Link href="/stats" className="hover:text-white transition-colors">Season Stats</Link>
            <Link href="/cards" className="hover:text-white transition-colors">Card Dex</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
