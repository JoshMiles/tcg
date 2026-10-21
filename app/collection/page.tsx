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
  const board = season ? await getSeasonLeaderboardCached(season).catch(() => null) : null;
  const rows = board?.rows.slice(0, 8) ?? [];
  const totalCards = board?.values.totalCards ?? 0;
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
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="font-display text-xl font-bold text-white">Top collectors{season ? <span className="text-sm font-normal text-gray-500"> · {season.name}</span> : null}</h2>
            <span className="flex items-baseline gap-3">
              <Link href="/cards" className="text-sm text-yellow-500 hover:text-yellow-300">Card dex</Link>
              <Link href="/leaderboard" className="text-sm text-yellow-500 hover:text-yellow-300">Full leaderboard →</Link>
            </span>
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rows.map((r, i) => (
              <li key={r.username}>
                <Link href={profileHref(r.username)} className="rind rounded-xl px-4 py-3 flex items-center gap-3 hover:brightness-110 transition">
                  <span className="w-6 flex justify-center text-gray-500 text-sm tabular-nums">{i < 3 ? <RankMedal rank={i + 1} /> : i + 1}</span>
                  <Avatar src={avatars[r.username] && sizeTwitchAvatar(avatars[r.username], 70)} name={r.username} className="w-9 h-9 text-sm" />
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-white truncate">{r.username}</span><span className="block text-xs text-gray-500">{r.uniqueCards}/{totalCards} collected</span></span>
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
