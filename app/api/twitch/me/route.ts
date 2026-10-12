import { NextRequest, NextResponse } from 'next/server';
import { getActiveSeason, getTwitchOpaqueUser } from '@/lib/kv';
import { verifyExtensionAuth, getBearerToken } from '@/lib/twitch-jwt';
import { collectionBonuses, getSeasonLeaderboard, getSeasonLeaderboardCached } from '@/lib/leaderboard';
import { tradesForUser } from '@/lib/trades';
import { VARIANTS } from '@/lib/variants';

export const dynamic = 'force-dynamic';

const DEV_OPAQUE_ID = 'dev_mock_opaque';

/**
 * Everything the Twitch panel needs to show "how am I doing" in one request: the viewer's rank and score breakdown, who is next up,
 * what every card is worth (base value, odds, copies out there), the serial numbers of the copies they hold, and how many trade
 * offers are waiting. The viewer comes from the signed Extension JWT (opaque ID → linked username), never from the query.
 * `?fresh=1` skips the shared 20-second leaderboard (used right after an upgrade).
 */
export async function GET(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
  const payload = await verifyExtensionAuth(token);
  const devMode = !payload && !process.env.TWITCH_EXTENSION_SECRET;
  if (!payload && !devMode) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  const username = await getTwitchOpaqueUser(payload?.opaque_user_id ?? DEV_OPAQUE_ID);
  if (!username) return NextResponse.json({ error: 'Log in first.' }, { status: 401 });

  const season = await getActiveSeason();
  if (!season || season.status === 'draft') return NextResponse.json({ error: 'No active season' }, { status: 404 });

  const { rows, values } = req.nextUrl.searchParams.get('fresh') === '1' ? await getSeasonLeaderboard(season) : await getSeasonLeaderboardCached(season);
  const idx = rows.findIndex(r => r.username === username);
  const row = idx >= 0 ? rows[idx] : null;
  const ahead = idx > 0 ? rows[idx - 1] : null;
  const full = collectionBonuses(values, values.totalCards);

  const held = values.serials?.held.get(username);
  const offers = await tradesForUser(username).then(t => t.incoming.filter(x => x.seasonId === season.id).length).catch(() => 0);

  return NextResponse.json({
    username,
    seasonId: season.id,
    totalCards: values.totalCards,
    players: rows.length,
    rank: idx >= 0 ? idx + 1 : null,
    row: row && {
      score: row.score, cardPoints: row.cardPoints, serialPoints: row.serialPoints, completionBonus: row.completionBonus, setBonus: row.setBonus,
      complete: row.complete, uniqueCards: row.uniqueCards, copies: row.copies,
    },
    next: ahead && row ? { username: ahead.username, gap: Math.max(0, ahead.score - row.score) } : null,
    maxCompletion: full.completion,
    setBonusValue: full.set,
    bonus: { max: values.settings.serialBonusMax, cutoff: values.settings.serialBonusCutoff },
    cards: Object.fromEntries([...values.cards.values()].map(c => [c.number, {
      values: VARIANTS.map(v => c.values[v]),
      raw: VARIANTS.map(v => Math.round(c.maths.raw[v] * 1000) / 1000),
      pullRate: c.pullRate,
      copies: c.copies,
    }])),
    // entry (card + variant) -> the serial numbers this viewer holds, lowest first
    serials: held ? Object.fromEntries([...held].map(([entry, list]) => [entry, list])) : {},
    offers,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
