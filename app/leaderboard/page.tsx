import { redirect } from 'next/navigation';
import { getActiveSeason, listSeasons } from '@/lib/kv';

export const dynamic = 'force-dynamic';

// /leaderboard → the active season's board (or the newest season if none is active).
export default async function LeaderboardIndex() {
  const season = (await getActiveSeason()) ?? (await listSeasons()).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!season) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center p-8">
        <div className="space-y-3">
          <div className="text-4xl">🏆</div>
          <h1 className="text-xl font-bold text-white">No seasons yet</h1>
          <p className="text-gray-500 text-sm">Check back when a season is running!</p>
        </div>
      </div>
    );
  }
  redirect(`/leaderboard/${season.id}`);
}
