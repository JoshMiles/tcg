import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { Avatar } from '@/app/components/Avatar';
import type { ProfileBase } from '@/lib/profile-data';
import { ShareProfile } from './ShareProfile';
import { accentHex, hasExperiment } from '@/lib/user-settings';
import type { ShareSpec } from '@/lib/share-image';
import { profileHref } from '@/lib/profile-url';

/** Who this is: avatar, name, awards, rank and progress, and the main actions (trade, share, leaderboard). */
export function ProfileHeader({ b, isOwner, signedIn, shareSpec }: { b: ProfileBase; isOwner: boolean; signedIn: boolean; shareSpec?: ShareSpec }) {
  const leaderboardHref = `/leaderboard/${b.season.id}`;
  const accent = hasExperiment(b.settings, 'accent') ? accentHex(b.settings.accent) : undefined;
  return (
    <header className="rounded-3xl border border-yellow-500/20 bg-gradient-to-br from-gray-900/80 to-gray-950/80" style={accent ? { borderColor: `${accent}88`, boxShadow: `0 0 40px -16px ${accent}` } : undefined}>
      <div className="holo-strip rounded-t-3xl" style={accent ? { background: `linear-gradient(90deg, transparent, ${accent}, transparent)` } : undefined} />
      <div className="p-5 sm:p-6 flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-start gap-4 min-w-0">
          <Avatar src={b.avatarUrl} name={b.displayName} className="w-16 h-16 sm:w-20 sm:h-20 text-2xl ring-2 ring-yellow-500/60 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-white leading-tight break-words">
              {b.displayName}
              {b.row?.complete && (
                <span className="ml-2 align-middle text-[10px] font-extrabold uppercase tracking-wider text-gray-950 bg-yellow-400 rounded-full px-2 py-0.5" title="Owns every card in the season">
                  <Icon name="cheese" className="mr-1" />Complete
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500">@{b.lower}{b.profile?.twitchId && b.profile.twitchId.toLowerCase() !== b.lower ? <span className="text-purple-400"> · Twitch: {b.profile.twitchId}</span> : null}</p>
            {b.bio && <p className="mt-2 text-sm text-gray-300 max-w-xl break-words">{b.bio}</p>}
            {b.awards.length > 0 && (
              <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Season awards">
                {b.awards.slice(0, 8).map((a, i) => (
                  <li key={`${a.seasonId}-${a.award.id}-${i}`}>
                    <Link href={`/leaderboard/${a.seasonId}`} title={`${a.award.title} · ${a.seasonName} · ${a.award.detail}`} className="inline-flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-0.5 text-[11px] font-bold text-yellow-300 hover:bg-yellow-500/20 transition-colors">
                      <Icon name={a.award.icon} className="w-3 h-3" />{a.award.title}<span className="text-yellow-500/70 font-semibold">· {b.season.id === a.seasonId ? 'this season' : a.seasonName}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-5 text-center sm:text-right shrink-0">
          <div><dt className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Rank</dt><dd className="font-display text-3xl font-bold text-yellow-400 tabular-nums leading-tight">{b.rank ? `#${b.rank}` : '-'}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Points</dt><dd className="font-display text-3xl font-bold text-white tabular-nums leading-tight">{b.row ? Math.round(b.row.score).toLocaleString() : '-'}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Cards</dt><dd className="font-display text-3xl font-bold text-white tabular-nums leading-tight">{b.uniqueOwned}<span className="text-lg text-gray-500">/{b.total}</span></dd></div>
        </dl>
      </div>

      <div className="px-5 sm:px-6 pb-5 space-y-4">
        <div>
          <div className="flex items-baseline justify-between text-xs text-gray-500 mb-1.5"><span>{b.season.name}</span><span className="tabular-nums">{b.pct}% complete{b.owned.length > b.uniqueOwned ? ` · ${b.owned.length} total pulls` : ''}</span></div>
          <div className="h-2.5 bg-gray-950 border border-gray-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={b.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Collection progress">
            <div className="h-full bg-gradient-to-r from-yellow-300 to-yellow-600 rounded-full" style={{ width: `${b.pct}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {signedIn && !isOwner && (
            <Link href={`/trade/new?to=${encodeURIComponent(b.lower)}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-200 bg-purple-500/10 border border-purple-400/40 hover:bg-purple-500/20 rounded-full px-3 py-1.5 transition-colors">
              <Icon name="trade" />Trade with {b.displayName}
            </Link>
          )}
          <ShareProfile name={b.displayName} username={b.lower} isOwner={isOwner} spec={shareSpec} customiseHref={isOwner ? profileHref(b.lower, 'share') : undefined} />
          <Link href={leaderboardHref} className="inline-flex items-center gap-1.5 text-xs font-bold text-yellow-300 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/20 rounded-full px-3 py-1.5 transition-colors">
            <Icon name="trophy" />Leaderboard
          </Link>
          {isOwner && (
            <Link href="/account" className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-200 bg-white/[0.06] border border-white/10 hover:bg-white/10 rounded-full px-3 py-1.5 transition-colors">
              <Icon name="trend" />My stats &amp; upgrades
            </Link>
          )}
          {isOwner && (
            <Link href="/settings" className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-200 bg-white/[0.06] border border-white/10 hover:bg-white/10 rounded-full px-3 py-1.5 transition-colors">
              <Icon name="settings" />Edit profile &amp; settings
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
