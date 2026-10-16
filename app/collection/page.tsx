import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, RankMedal } from '@/app/components/Icon';
import { Avatar } from '@/app/components/Avatar';
import { getActiveSeason } from '@/lib/kv';
import { getSeasonLeaderboardCached } from '@/lib/leaderboard';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { profileHref } from '@/lib/profile-url';
import { CollectorFinder } from './CollectorFinder';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Find a collector', description: 'Look up any viewer\'s profile, collection and rank on The Cheesy TCG.' };

// Every collection is now a profile (/u/<name>); this page is the way in.
export default async function FindCollector() {
  const season = await getActiveSeason().catch(() => null);
  const rows = season ? (await getSeasonLeaderboardCached(season).catch(() => null))?.rows.slice(0, 8) ?? [] : [];
  const avatars = await getAvatars(rows.map(r => r.username));

  return (
    <div className="max-w-3xl mx-auto px-4 py-14 space-y-10">
      <header className="text-center space-y-3">
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-white">Find a collector</h1>
        <p className="text-gray-400 max-w-lg mx-auto">Enter a Twitch username to see their profile: collection, rank, points, awards and trades.</p>
      </header>
      <CollectorFinder />
      {rows.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-bold text-white">Top collectors{season ? <span className="text-sm font-normal text-gray-500"> · {season.name}</span> : null}</h2>
            <Link href="/leaderboard" className="text-sm text-yellow-500 hover:text-yellow-300">Full leaderboard →</Link>
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rows.map((r, i) => (
              <li key={r.username}>
                <Link href={profileHref(r.username)} className="rind rounded-xl px-4 py-3 flex items-center gap-3 hover:brightness-110 transition">
                  <span className="w-6 flex justify-center text-gray-500 text-sm tabular-nums">{i < 3 ? <RankMedal rank={i + 1} /> : i + 1}</span>
                  <Avatar src={avatars[r.username] && sizeTwitchAvatar(avatars[r.username], 70)} name={r.username} className="w-9 h-9 text-sm" />
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-white truncate">{r.username}</span><span className="block text-xs text-gray-500">{r.uniqueCards} cards</span></span>
                  <span className="font-display font-bold text-yellow-400 tabular-nums">{Math.round(r.score).toLocaleString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-center text-xs text-gray-600"><Icon name="info" className="mr-1" />Profiles are public: they show a collector&apos;s cards, rank and awards. See the <Link href="/privacy" className="underline hover:text-gray-400">Privacy Policy</Link>.</p>
    </div>
  );
}
