import { notFound } from 'next/navigation';
import Link from 'next/link';
import { listSeasons, getCollection, getPackCards, getPack, getUserProfile } from '@/lib/kv';
import type { Season, Pack, Card } from '@/lib/types';
import { getRarity } from '@/lib/rarity';
import { countPulls } from '@/lib/collection';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { Avatar } from '@/app/components/Avatar';
import { CardTile } from '@/app/components/CardTile';
import {
  updateUserProfile, removeUserCard, grantUserCard,
  resetUserSeason, resetUser, deleteUser,
} from '../../actions';

export const dynamic = 'force-dynamic';

type SeasonEntry = {
  season: Season;
  ownedNumbers: number[];
  countMap: Map<number, number>;
  packs: Array<{ pack: Pack; cards: Card[] }>;
};

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawUsername } = await params;
  const username = rawUsername.toLowerCase();

  const [profile, seasons, avatars] = await Promise.all([
    getUserProfile(username),
    listSeasons(),
    getAvatars([username]),
  ]);

  const collections = await Promise.all(
    seasons.map(s => getCollection(s.collectionName))
  );

  const seasonEntries: SeasonEntry[] = await Promise.all(
    seasons.map(async (season, i) => {
      const ownedNumbers = collections[i][username] ?? [];
      const countMap = countPulls(ownedNumbers);

      const packData = await Promise.all(
        season.packIds.map(async packId => {
          const [pack, cards] = await Promise.all([getPack(packId), getPackCards(packId)]);
          return pack ? { pack, cards } : null;
        })
      );

      return {
        season,
        ownedNumbers,
        countMap,
        packs: packData.filter((p): p is { pack: Pack; cards: Card[] } => p !== null),
      };
    })
  );

  // 404 if user has no cards anywhere and no profile
  const hasAnyCards = seasonEntries.some(e => e.ownedNumbers.length > 0);
  if (!hasAnyCards && !profile) notFound();

  const displayName = profile?.displayName || username;
  const totalCards = seasonEntries.reduce((s, e) => s + e.countMap.size, 0); // unique cards
  const activeSeasons = seasonEntries.filter(e => e.ownedNumbers.length > 0).length;

  const updateProfile = updateUserProfile.bind(null, username);
  const resetAll = resetUser.bind(null, username);
  const deleteThisUser = deleteUser.bind(null, username);

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Breadcrumb */}
      <div>
        <Link href="/admin/users" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
          ← Users
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Avatar src={avatars[username] && sizeTwitchAvatar(avatars[username], 150)} name={displayName} className="w-16 h-16 text-2xl ring-2 ring-yellow-500/60" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-bold text-white">{displayName}</h1>
            {profile?.twitchId && (
              <span className="text-xs px-1.5 py-0.5 bg-purple-900/40 text-purple-400 rounded-md">Twitch</span>
            )}
          </div>
          <p className="text-sm text-gray-500 font-mono mt-0.5">
            {username}
            {totalCards > 0 && (
              <span className="text-gray-600 not-italic">
                {' '}· {totalCards} card{totalCards !== 1 ? 's' : ''}
                {' '}· {activeSeasons} season{activeSeasons !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <div className="ml-auto shrink-0">
          <a
            href={`/collection/${username}`}
            target="_blank"
            className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors"
          >
            ↗ Public Collection
          </a>
        </div>
      </div>

      {/* Profile edit */}
      <section className="tcg-panel rounded-2xl p-6">
        <h2 className="font-semibold text-white mb-4">Profile</h2>
        <form action={updateProfile} className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Display name</label>
            <input
              name="displayName"
              defaultValue={profile?.displayName || username}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Twitch username</label>
            <input
              name="twitchId"
              defaultValue={profile?.twitchId || ''}
              placeholder="twitch_username"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Notes</label>
            <input
              name="notes"
              defaultValue={profile?.notes || ''}
              placeholder="Optional"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
            />
          </div>
          <div className="col-span-3">
            <button
              type="submit"
              className="px-4 py-2 tcg-btn rounded-xl text-sm transition-colors"
            >
              Save Profile
            </button>
          </div>
        </form>
      </section>

      {/* Per-season collection */}
      {seasonEntries.filter(e => e.packs.length > 0).map(({ season, ownedNumbers, countMap, packs }) => {
        const totalSeasonCards = packs.reduce((s, p) => s + p.cards.length, 0);
        const pct = totalSeasonCards > 0 ? Math.round(countMap.size / totalSeasonCards * 100) : 0;
        const grant = grantUserCard.bind(null, username, season.collectionName);
        const resetSeason = resetUserSeason.bind(null, username, season.collectionName);

        return (
          <section key={season.id} className="tcg-panel rounded-2xl overflow-hidden">

            {/* Season header */}
            <div className="holo-strip" />
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl font-bold text-white">{season.name}</h2>
                  {season.active && (
                    <span className="text-xs px-1.5 py-0.5 bg-green-900/40 text-green-400 rounded-md">Active</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {countMap.size} / {totalSeasonCards} cards · {pct}%{ownedNumbers.length > countMap.size && ` · ${ownedNumbers.length} total pulls`}
                </p>
              </div>
              {ownedNumbers.length > 0 && (
                <form action={resetSeason}>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs text-red-500 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition-colors shrink-0"
                  >
                    Reset Season
                  </button>
                </form>
              )}
            </div>

            <div className="p-6 space-y-6">

              {/* Card grid per pack */}
              {packs.map(({ pack, cards }) => {
                const ownedInPack = cards.filter(c => countMap.has(c.number)).length;

                return (
                  <div key={pack.id}>
                    {packs.length > 1 && (
                      <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">
                        {pack.name} · {ownedInPack} / {cards.length}
                      </p>
                    )}
                    <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-3">
                      {cards.map(card => {
                        const count = countMap.get(card.number) ?? 0;
                        const owned = count > 0;
                        const color = getRarity(card.stars)?.hex ?? '#fbbf24';
                        const remove = removeUserCard.bind(null, username, season.collectionName, card.number);

                        return (
                          <div key={card.id} className="relative group">
                            {owned && card.imageUrl ? (
                              <CardTile
                                imageUrl={card.imageUrl}
                                alt={card.name}
                                className="aspect-[2/3] rounded-lg overflow-hidden bg-gray-800 holo-hover border-2"
                                style={{ borderColor: color, boxShadow: `0 0 12px -4px ${color}` }}
                              />
                            ) : (
                              <div
                                className={`aspect-[2/3] rounded-lg overflow-hidden bg-gray-800 ${owned ? 'holo-hover border-2' : 'border border-dashed border-gray-700'}`}
                                style={owned ? { borderColor: color, boxShadow: `0 0 12px -4px ${color}` } : undefined}
                              >
                                <div className="w-full h-full flex items-center justify-center text-gray-700 text-xs font-bold border border-gray-700/50 rounded-lg">
                                  {card.number}
                                </div>
                              </div>
                            )}

                            {/* Duplicate count badge */}
                            {count > 1 && (
                              <div className="absolute top-1 left-1 bg-gray-950/85 border border-yellow-500/50 text-yellow-300 text-[10px] font-extrabold px-1.5 rounded-full leading-tight pointer-events-none z-10">
                                ×{count}
                              </div>
                            )}

                            {/* Remove button (hover) */}
                            {owned && (
                              <form action={remove} className="absolute -top-1.5 -right-1.5 hidden group-hover:block z-10">
                                <button
                                  type="submit"
                                  title={`Remove ${card.name}`}
                                  className="w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center text-xs leading-none transition-colors"
                                >
                                  ×
                                </button>
                              </form>
                            )}

                            {/* Card name on hover */}
                            {owned && (
                              <p
                                className="text-center mt-1 text-[9px] leading-tight truncate px-0.5 text-gray-600 group-hover:text-gray-400 transition-colors"
                                title={card.name}
                              >
                                {card.name}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Grant card */}
              <div className="border-t border-gray-800 pt-5">
                <p className="text-xs text-gray-500 mb-2">Grant a card</p>
                <form action={grant} className="flex items-center gap-3 flex-wrap">
                  <select
                    name="cardNumber"
                    className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
                  >
                    {packs.flatMap(({ pack, cards }) =>
                      cards.map(card => (
                        <option key={card.id} value={card.number}>
                          {packs.length > 1 ? `[${pack.name}] ` : ''}#{card.number} {card.name} {'★'.repeat(card.stars)}{countMap.has(card.number) ? ' ✓' : ''}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2 tcg-btn rounded-xl text-sm transition-colors"
                  >
                    Grant
                  </button>
                </form>
              </div>

            </div>
          </section>
        );
      })}

      {/* Empty state */}
      {!hasAnyCards && (
        <div className="tcg-panel rounded-2xl py-16 text-center">
          <p className="text-gray-500 text-sm">No cards pulled yet</p>
        </div>
      )}

      {/* Danger zone */}
      <section className="bg-gray-900 border border-red-950/40 rounded-2xl p-6">
        <h2 className="font-semibold text-red-400 mb-1">Danger Zone</h2>
        <p className="text-xs text-gray-500 mb-4">
          These actions cannot be undone.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <form action={resetAll}>
            <button
              type="submit"
              className="px-4 py-2 text-sm text-red-500 hover:text-red-300 bg-red-950/40 hover:bg-red-950/70 rounded-xl transition-colors"
            >
              Reset All Seasons
            </button>
          </form>
          <form action={deleteThisUser}>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-semibold text-white bg-red-700 hover:bg-red-600 rounded-xl transition-colors"
            >
              Delete User
            </button>
          </form>
        </div>
      </section>

    </div>
  );
}
