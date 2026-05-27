import Link from 'next/link';
import { getActiveSeasonWithCards, getCollection } from '@/lib/kv';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const result = await getActiveSeasonWithCards();

  if (!result) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 text-center space-y-3">
          <p className="text-gray-400">No active season. Seed Season 1 or create a new season to get started.</p>
          <div className="flex gap-3 justify-center">
            <SeedButton />
            <Link href="/admin/seasons/new" className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-sm">
              Create Season
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { season, cards } = result;
  const collection = await getCollection(season.collectionName);
  const users = Object.entries(collection);

  const totalUsers = users.length;
  const totalOwned = users.reduce((s, [, c]) => s + c.length, 0);

  const freq: Record<number, number> = {};
  users.forEach(([, owned]) => owned.forEach(n => { freq[n] = (freq[n] ?? 0) + 1; }));

  const cardStats = cards
    .map(c => ({ ...c, ownedBy: freq[c.number] ?? 0 }))
    .sort((a, b) => b.ownedBy - a.ownedBy);

  const topCollectors = users
    .map(([username, owned]) => ({ username, owned: owned.length, pct: Math.round(owned.length / cards.length * 100) }))
    .sort((a, b) => b.owned - a.owned)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-sm text-gray-400">Active: <span className="text-yellow-400">{season.name}</span></span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Players', value: totalUsers },
          { label: 'Cards Owned', value: totalOwned },
          { label: 'Total Cards', value: cards.length },
          { label: 'Avg Completion', value: totalUsers > 0 ? `${Math.round(totalOwned / totalUsers / cards.length * 100)}%` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top collectors */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="font-semibold text-sm">Top Collectors</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase">
                <th className="text-left px-4 py-2">Player</th>
                <th className="text-right px-4 py-2">Cards</th>
                <th className="text-right px-4 py-2">%</th>
              </tr>
            </thead>
            <tbody>
              {topCollectors.map(({ username, owned, pct }) => (
                <tr key={username} className="border-t border-gray-800 hover:bg-gray-800">
                  <td className="px-4 py-2 text-gray-200">{username}</td>
                  <td className="px-4 py-2 text-right">{owned}/{cards.length}</td>
                  <td className="px-4 py-2 text-right text-yellow-400">{pct}%</td>
                </tr>
              ))}
              {topCollectors.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-4 text-center text-gray-500">No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Card ownership */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="font-semibold text-sm">Card Ownership</h2>
          </div>
          <div className="overflow-y-auto max-h-72">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="text-gray-500 text-xs uppercase">
                  <th className="text-left px-4 py-2">#</th>
                  <th className="text-left px-4 py-2">Card</th>
                  <th className="text-right px-4 py-2">★</th>
                  <th className="text-right px-4 py-2">Owners</th>
                </tr>
              </thead>
              <tbody>
                {cardStats.map(c => (
                  <tr key={c.id} className="border-t border-gray-800 hover:bg-gray-800">
                    <td className="px-4 py-2 text-gray-500">{c.number}</td>
                    <td className="px-4 py-2 text-gray-200">{c.name}</td>
                    <td className="px-4 py-2 text-right text-yellow-400">{'★'.repeat(c.stars)}</td>
                    <td className="px-4 py-2 text-right">{c.ownedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SeedButton() {
  async function seed() {
    'use server';
    await fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/seed`, { method: 'POST' });
  }
  return (
    <form action={seed}>
      <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg text-sm">
        Seed Season 1
      </button>
    </form>
  );
}
