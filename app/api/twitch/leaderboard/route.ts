import { NextRequest, NextResponse } from 'next/server';
import { getActiveSeason, getSeason } from '@/lib/kv';
import { getSeasonLeaderboard } from '@/lib/leaderboard';
import { getStaffBadges } from '@/lib/staff-badge';


// Public per-season leaderboard for the Twitch panel. `seasonId` defaults to the active season;
// `username` adds that viewer's own rank even when they're outside the top entries.
export async function GET(req: NextRequest) {
  const seasonId = req.nextUrl.searchParams.get('seasonId');
  const me = req.nextUrl.searchParams.get('username')?.toLowerCase().trim();

  const season = seasonId ? await getSeason(seasonId) : await getActiveSeason();
  if (!season || season.status === 'draft') return NextResponse.json({ error: 'No season' }, { status: 404 });

  const { rows, values } = await getSeasonLeaderboard(season);
  const mine = me ? rows.findIndex(r => r.username === me) : -1;

  return NextResponse.json({
    seasonId: season.id,
    seasonName: season.name,
    totalCards: values.totalCards,
    players: rows.length,
    rows: rows.slice(0, values.settings.leaderboardSize).map((r, i) => ({ rank: i + 1, ...r })),
    me: mine >= 0 ? { rank: mine + 1, ...rows[mine] } : null,
    // Staff badges (login -> 'streamer' | 'admin' | 'mod') for anyone on the board, as the website shows them.
    badges: await getStaffBadges(),
    // Per-card point values, so the panel can show what each copy is worth.
    values: Object.fromEntries(
      [...values.cards.values()].map(c => [c.number, { values: c.values }])
    ),
  });
}
