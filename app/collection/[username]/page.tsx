import { notFound } from 'next/navigation';
import {
  getActiveSeasonWithPacks,
  getCollection,
  getUserProfile,
} from '@/lib/kv';
import { RARITIES, getRarity } from '@/lib/rarity';
import { countPulls } from '@/lib/collection';
import { BrandMark } from '@/app/admin/components/BrandMark';

export const dynamic = 'force-dynamic';

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const lower = username.toLowerCase();

  const [result, profile] = await Promise.all([
    getActiveSeasonWithPacks(),
    getUserProfile(lower),
  ]);

  const displayName = profile?.displayName || username;

  if (!result) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-center p-8">
        <div className="space-y-3">
          <div className="text-4xl">🃏</div>
          <h1 className="text-xl font-bold text-white">No active season</h1>
          <p className="text-gray-500 text-sm">Check back when a season is running!</p>
        </div>
      </div>
    );
  }

  const { season, packs } = result;
  const allCards = packs
    .flatMap(({ pack, cards }) => cards.map(c => ({ ...c, packName: pack.name })))
    .sort((a, b) => b.stars - a.stars || a.number - b.number);

  const collection = await getCollection(season.collectionName);
  const ownedArray = collection[lower] ?? [];
  const countMap = countPulls(ownedArray);

  const totalPulls = ownedArray.length;
  const owned = allCards.filter(c => countMap.has(c.number));
  const total = allCards.length;
  const pct = total > 0 ? Math.round(owned.length / total * 100) : 0;

  // Group by rarity for the breakdown
  const rarityBreakdown = RARITIES.map(r => {
    const rarityCards = allCards.filter(c => c.stars === r.stars);
    const rarityOwned = rarityCards.filter(c => countMap.has(c.number));
    return { ...r, total: rarityCards.length, owned: rarityOwned.length };
  }).filter(r => r.total > 0);

  return (
    <div className="min-h-screen text-gray-100">
      {/* Header */}
      <div className="border-b border-poke-blue-light/20 bg-gray-950/70 backdrop-blur">
        <div className="holo-strip" />
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark size={44} />
            <div>
              <h1 className="font-bold text-white text-2xl leading-none">{displayName}</h1>
              {profile?.twitchId && (
                <p className="text-xs text-purple-400 mt-0.5">Twitch: {profile.twitchId}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl font-bold text-yellow-400 tabular-nums leading-none">{pct}%</p>
            <p className="text-xs text-gray-500">
              {owned.length}/{total} cards · {season.name}
            </p>
            {totalPulls > owned.length && (
              <p className="text-xs text-gray-600">{totalPulls} total pulls</p>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="max-w-4xl mx-auto px-4 pb-4">
          <div className="h-3 bg-gray-950 border border-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-yellow-300 to-yellow-600 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Rarity breakdown */}
        {rarityBreakdown.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {rarityBreakdown.map(r => (
              <div
                key={r.stars}
                className="tcg-panel rounded-xl p-3 text-center"
              >
                <p className="text-xs font-medium mb-1" style={{ color: r.hex }}>
                  {'★'.repeat(r.stars)}
                </p>
                <p className="text-lg font-bold text-white tabular-nums">{r.owned}/{r.total}</p>
                <p className="text-xs text-gray-600">{r.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Card grid */}
        {allCards.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            No cards in this season yet.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-3">
            {allCards.map(card => {
              const count = countMap.get(card.number) ?? 0;
              const isOwned = count > 0;
              const rarity = getRarity(card.stars);
              return (
                <div
                  key={card.id}
                  title={isOwned ? `#${card.number} ${card.name} · ${'★'.repeat(card.stars)}${count > 1 ? ` · ×${count} pulls` : ''}` : `#${card.number} ???`}
                  className={`relative aspect-[2/3] rounded-xl overflow-hidden group transition-transform ${
                    isOwned ? 'holo-hover border-2 hover:-translate-y-1' : 'border border-dashed border-gray-700 bg-gray-900/40'
                  }`}
                  style={isOwned ? { borderColor: rarity?.hex, boxShadow: `0 0 14px -4px ${rarity?.hex}` } : undefined}
                >
                  {isOwned && card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-900/60 flex items-center justify-center">
                      {isOwned ? (
                        <span className="text-xs text-gray-500 font-bold">#{card.number}</span>
                      ) : (
                        <span className="font-display text-gray-600 font-bold text-2xl">?</span>
                      )}
                    </div>
                  )}
                  {/* Hover name */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-xs text-white truncate leading-none">{isOwned ? card.name : `#${card.number}`}</p>
                  </div>
                  {/* Rarity dot */}
                  {isOwned && (
                    <div
                      className="absolute top-1 right-1 w-2 h-2 rounded-full"
                      style={{ backgroundColor: rarity?.hex }}
                    />
                  )}
                  {/* Pull count badge */}
                  {count > 1 && (
                    <div className="absolute top-1 left-1 bg-gray-950/85 border border-yellow-500/50 text-yellow-300 text-[10px] font-extrabold px-1.5 rounded-full leading-tight">
                      ×{count}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-xs text-gray-700 pt-2">
          Pull cards live on stream · <a href="/collection" className="hover:text-gray-500 transition-colors">view another collection →</a>
        </p>
      </div>
    </div>
  );
}
