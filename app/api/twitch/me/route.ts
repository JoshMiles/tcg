import { NextRequest, NextResponse } from 'next/server';
import { getActiveSeason, getTwitchOpaqueUser } from '@/lib/kv';
import { verifyExtensionAuth, getBearerToken } from '@/lib/twitch-jwt';
import { collectionBonuses, getSeasonLeaderboard, getSeasonLeaderboardCached } from '@/lib/leaderboard';
import { tradesForUser } from '@/lib/trades';
import { VARIANTS } from '@/lib/variants';
import { getOwnerCopies, isTracking, mintedCounts } from '@/lib/serials';
import { panelEditions } from '@/lib/panel-editions';
import { getUserSettings } from '@/lib/user-settings-store';
import { FAVOURITES_MAX } from '@/lib/user-settings';
import { getStaffBadges } from '@/lib/staff-badge';

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

  // The viewer's own numbered editions (empty while the season's editions are not numbered), which of them they favourited, and their staff badge.
  const tracking = await isTracking(season.collectionName);
  const [copies, minted, prefs, badges] = await Promise.all([
    tracking ? getOwnerCopies(season.collectionName, username) : [],
    tracking ? mintedCounts(season.collectionName).catch(() => null) : null,
    getUserSettings(username),
    getStaffBadges(),
  ]);
  const heldUids = new Set(copies.map(c => c.uid));

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
    // entry (card + variant) -> the viewer's editions { n, uid?, at, date, origin, made?, est? }, lowest first
    editions: panelEditions(copies, minted),
    // serial numbers of the editions the viewer holds and has marked as favourites (they can't be traded or spent in an upgrade)
    favourites: prefs.favourites.filter(uid => heldUids.has(uid)),
    favouritesMax: FAVOURITES_MAX,
    // Streamer / Admin / Mod, as the website shows next to the name (null when none or hidden)
    badge: badges[username] ?? null,
  },{ headers: { 'Cache-Control': 'no-store' } });
}
