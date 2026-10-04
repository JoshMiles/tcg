import Link from 'next/link';
import { getActiveSeasonWithPacks, getCollection } from '@/lib/kv';
import { seedSeason1 } from './actions';
import { rarityStats, getRarity } from '@/lib/rarity';
import { uniqueCount } from '@/lib/collection';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { Avatar } from '@/app/components/Avatar';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const result = await getActiveSeasonWithPacks();

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center">
        <div className="space-y-2">
          <div className="text-5xl mb-4">🃏</div>
          <h1 className="text-3xl font-bold text-white">Welcome to TCG Admin</h1>
          <p className="text-gray-500 max-w-sm">
            No active season yet. Seed Season 1 to get started with the starter pack, or create your own.
          </p>
        </div>
        <div className="flex gap-3">
          <SeedButton />
          <Link
            href="/admin/seasons/new"
            className="px-5 py-2.5 tcg-btn rounded-xl text-sm transition-colors"
          >
            Create Season
          </Link>
          <Link
            href="/admin/packs/new"
            className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl text-sm transition-colors"
          >
            Create Pack
          </Link>
        </div>
      </div>
    );
  }

  const { season, packs } = result;
  const allCards = packs.flatMap(p => p.cards);
  const collection = await getCollection(season.collectionName);
  const users = Object.entries(collection);

  const totalUsers = users.length;
  // Total pulls (duplicates included) vs. unique cards, which is what completion is based on
  const totalOwned = users.reduce((s, [, c]) => s + c.length, 0);
  const totalUnique = users.reduce((s, [, c]) => s + uniqueCount(c), 0);
  const avgCompletion = totalUsers > 0 && allCards.length > 0
    ? Math.round(totalUnique / totalUsers / allCards.length * 100)
    : 0;

  const freq: Record<number, number> = {};
  users.forEach(([, owned]) => new Set(owned).forEach(n => { freq[n] = (freq[n] ?? 0) + 1; }));

  const topCollectors = users
    .map(([username, owned]) => ({
      username,
      owned: uniqueCount(owned),
      pct: allCards.length > 0 ? Math.round(uniqueCount(owned) / allCards.length * 100) : 0,
    }))
    .sort((a, b) => b.owned - a.owned)
    .slice(0, 8);

  const cardStats = allCards
    .map(c => ({ ...c, ownedBy: freq[c.number] ?? 0 }))
    .sort((a, b) => b.stars - a.stars || b.ownedBy - a.ownedBy);

  const avatars = await getAvatars(topCollectors.map(c => c.username));

  const rarityDist = rarityStats(allCards);

  const stats = [
    { label: 'Players',      accent: 'from-poke-blue-light to-poke-blue', value: totalUsers,        sub: 'unique collectors'            },
    { label: 'Cards Pulled', accent: 'from-yellow-300 to-yellow-600', value: totalOwned,        sub: 'total across all players'     },
    { label: 'Card Pool',    accent: 'from-red-400 to-poke-red', value: allCards.length,   sub: `across ${packs.length} pack${packs.length !== 1 ? 's' : ''}` },
    { label: 'Avg Complete', accent: 'from-emerald-300 to-emerald-600', value: `${avgCompletion}%`, sub: totalUsers > 0 ? `${topCollectors[0]?.pct ?? 0}% best` : 'no players yet' },
  ];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-yellow-500 font-bold uppercase tracking-widest mb-1">★ Active Season</p>
          <h1 className="text-4xl font-bold text-white">{season.name}</h1>
        </div>
        <div className="flex gap-2 pt-1">
          <Link
            href={`/admin/seasons/${season.id}`}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          >
            Season Settings
          </Link>
          <SeedButton />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, accent, value, sub }) => (
          <div
            key={label}
            className="tcg-panel holo-hover rounded-2xl overflow-hidden hover:-translate-y-0.5 hover:shadow-glow transition-all"
          >
            <div className={`h-1.5 bg-gradient-to-r ${accent}`} />
            <div className="p-5 space-y-1">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">{label}</p>
              <p className="font-display text-4xl font-bold text-white tabular-nums">{value}</p>
              <p className="text-xs text-gray-500">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Middle row */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Top Collectors */}
        <div className="lg:col-span-2 tcg-panel rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold text-white">Top Collectors</h2>
            <Link href="/admin/users" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              View all →
            </Link>
          </div>
          {topCollectors.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-600 text-sm">
              No players yet — share the overlay and start pulling cards!
            </div>
          ) : (
            <div className="divide-y divide-gray-800/60">
              {topCollectors.map(({ username, owned, pct }, i) => (
                <div key={username} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-800/30 transition-colors">
                  <span className={`text-sm font-bold w-5 tabular-nums shrink-0 ${
                    i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-gray-700'
                  }`}>
                    {i + 1}
                  </span>
                  <Avatar src={avatars[username] && sizeTwitchAvatar(avatars[username], 70)} name={username} className="w-8 h-8 text-xs" />
                  <span className="flex-1 text-sm font-mono text-gray-200 truncate">{username}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 tabular-nums w-16 text-right">
                      {owned}/{allCards.length} <span className="text-gray-700">·</span> <span className="text-yellow-500">{pct}%</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rarity breakdown + Active Packs */}
        <div className="space-y-4">

          {/* Rarity distribution */}
          <div className="tcg-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">Rarity Mix</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              {rarityDist.length === 0 ? (
                <p className="text-sm text-gray-600">No cards in active packs</p>
              ) : (
                rarityDist.map(r => (
                  <div key={r.stars} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`${r.text} font-medium`}>{'★'.repeat(r.stars)}</span>
                      <span className="text-gray-600">{r.count} cards · {r.pct}%</span>
                    </div>
                    <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full ${r.bar} rounded-full`} style={{ width: `${r.pct}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active packs */}
          <div className="tcg-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-semibold text-white">Active Packs</h2>
              <Link href="/admin/packs" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                Manage →
              </Link>
            </div>
            {packs.length === 0 ? (
              <div className="px-5 py-6 text-center text-gray-600 text-sm">
                No active packs in this season
              </div>
            ) : (
              <div className="divide-y divide-gray-800/60">
                {packs.map(({ pack, cards }) => (
                  <div key={pack.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-800/30 transition-colors">
                    {pack.coverImageUrl ? (
                      <img src={pack.coverImageUrl} alt={pack.name} loading="lazy" className="w-7 h-9 object-cover rounded shrink-0" />
                    ) : (
                      <div className="w-7 h-9 bg-gray-800 rounded shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{pack.name}</p>
                      <p className="text-xs text-gray-600">{cards.length} cards</p>
                    </div>
                    <Link href={`/admin/packs/${pack.id}`} className="text-xs text-gray-700 hover:text-gray-400 transition-colors shrink-0">
                      →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card ownership table */}
      <div className="tcg-panel rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="font-semibold text-white">Card Ownership</h2>
          <span className="text-xs text-gray-600">sorted by rarity</span>
        </div>
        <div className="overflow-y-auto max-h-80">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900">
              <tr className="text-gray-600 text-xs uppercase border-b border-gray-800">
                <th className="text-left px-5 py-3">#</th>
                <th className="text-left px-5 py-3">Card</th>
                <th className="text-left px-5 py-3">Pack</th>
                <th className="text-right px-5 py-3">Rarity</th>
                <th className="text-right px-5 py-3">Owners</th>
                <th className="text-right px-5 py-3 w-28">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {cardStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-gray-600">No cards in active packs</td>
                </tr>
              )}
              {cardStats.map(c => {
                const rarity = getRarity(c.stars);
                const covPct = totalUsers > 0 ? Math.round(c.ownedBy / totalUsers * 100) : 0;
                // find which pack this card is in
                const packName = packs.find(({ cards }) => cards.some(pc => pc.id === c.id))?.pack.name ?? '';
                return (
                  <tr key={c.id} className="border-t border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-2.5 text-gray-600 tabular-nums text-xs">{c.number}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {c.imageUrl ? (
                          <img src={c.imageUrl} alt={c.name} loading="lazy" className="w-5 h-7 object-cover rounded shrink-0" />
                        ) : (
                          <div className="w-5 h-7 bg-gray-800 rounded shrink-0" />
                        )}
                        <span className="text-gray-200">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-gray-600 text-xs">{packName}</td>
                    <td className="px-5 py-2.5 text-right">
                      <span className={`text-xs font-medium ${rarity?.text ?? 'text-gray-400'}`}>
                        {'★'.repeat(c.stars)}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right text-gray-400 tabular-nums">{c.ownedBy}</td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gray-500 rounded-full" style={{ width: `${covPct}%` }} />
                        </div>
                        <span className="text-xs text-gray-600 tabular-nums w-8 text-right">{covPct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SeedButton() {
  return (
    <form action={seedSeason1}>
      <button
        type="submit"
        className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors"
      >
        Seed S1
      </button>
    </form>
  );
}
