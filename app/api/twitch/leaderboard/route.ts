import { NextRequest, NextResponse } from 'next/server';
import { getActiveSeason, getSeason } from '@/lib/kv';
import { getSeasonLeaderboard } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

const LIMIT = 100;

// Public per-season leaderboard for the Twitch panel. `seasonId` defaults to the active season;
// `username` adds that viewer's own rank even when they're outside the top LIMIT.
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
    rows: rows.slice(0, LIMIT).map((r, i) => ({ rank: i + 1, ...r })),
    me: mine >= 0 ? { rank: mine + 1, ...rows[mine] } : null,
    // Per-card point values, so the panel can show what each copy is worth.
    values: Object.fromEntries(
      [...values.cards.values()].map(c => [c.number, { values: c.values, scarcity: Math.round(c.scarcity * 100) / 100 }])
    ),
  });
}
