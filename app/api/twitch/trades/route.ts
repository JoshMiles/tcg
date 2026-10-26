import { NextRequest, NextResponse } from 'next/server';
import { getActiveSeason, getCollection } from '@/lib/kv';
import { acceptTrade, cancelTrade, counterTrade, createTrade, declineTrade, getTradeSettings, sweepTrades, tradesForUser, listOpenTrades } from '@/lib/trades';
import { firstMissing, type Trade } from '@/lib/trade-core';
import { getPrintPool, getTradeCards, getTradePools, poolsFor, stackPoints } from '@/lib/trade-view';
import { extensionViewer } from '@/lib/twitch-viewer';
import { parseGetIds, respond } from '@/lib/trade-api';
import { getUserSettings } from '@/lib/user-settings-store';
import { matchingAlerts } from '@/lib/watch-core';
import { getStaffBadges } from '@/lib/staff-badge';

const BOARD_MAX = 30;
const RECENT_MAX = 8;

// Trading from the Twitch panel. The viewer always comes from the signed Extension JWT (see lib/twitch-viewer.ts), and every
// action goes through the same engine as the website (escrow, locks, serials, notices), so the rules cannot differ.

/** Everything the panel's Trades tab shows: offers for the viewer, their own open offers, the open board and recent results. */
export async function GET(req: NextRequest) {
  const viewer = await extensionViewer(req);
  if ('response' in viewer) return viewer.response;
  const me = viewer.username;

  const season = await getActiveSeason();
  if (!season || season.status === 'draft') return NextResponse.json({ error: 'No active season' }, { status: 404 });
  await sweepTrades(); // refund anything that ran out of time before listing it

  const [settings, cards, mine, open, data, prefs, prints] = await Promise.all([
    getTradeSettings(), getTradeCards(season), tradesForUser(me), listOpenTrades(), getCollection(season.collectionName), getUserSettings(me), getPrintPool(season, me),
  ]);
  const here = (list: Trade[]) => list.filter(t => t.seasonId === season.id);
  const incoming = here(mine.incoming);
  const outgoing = here(mine.outgoing);
  // The whole board is checked against the viewer's Looking for list and saved alerts; the matches come first and are never cut off.
  const allBoard = here(open.filter(t => t.kind === 'listing' && t.from !== me));
  const isMatch = (t: Trade) => matchingAlerts(prefs, t.give).length > 0;
  const board = [...allBoard.filter(isMatch), ...allBoard.filter(t => !isMatch(t))].slice(0, BOARD_MAX);
  const recent = here(mine.recent).slice(0, RECENT_MAX);
  const owned = data[me] ?? [];
  const pools = await getTradePools(season, [...incoming, ...outgoing, ...board, ...recent], me);

  const view = (t: Trade) => {
    const p = poolsFor(t, pools);
    return {
      id: t.id, kind: t.kind, from: t.from, to: t.to ?? null, give: t.give, get: t.get, note: t.note ?? null, status: t.status,
      expiresAt: t.expiresAt, resolvedAt: t.resolvedAt ?? null, resolvedBy: t.resolvedBy ?? null, counter: !!t.counterOf,
      givePts: stackPoints(t.give, cards, p.give), getPts: stackPoints(t.get, cards, p.get),
      // Can the viewer hand over what the offer asks for?
      canTake: t.from !== me && firstMissing(owned, t.get) === null,
      // Gives a card from the viewer's Looking for list or one of their saved alerts.
      alert: t.kind === 'listing' && t.from !== me && isMatch(t),
      // Staff reversed this completed trade (it keeps status 'accepted'): the panel says "Reversed by staff".
      reversed: !!t.reversedAt,
    };
  };

  return NextResponse.json({
    username: me,
    seasonId: season.id,
    enabled: settings.enabled && !season.tradingFrozen,
    closedReason: !settings.enabled ? 'Trading is paused right now.' : season.tradingFrozen ? 'Trading is closed for this season.' : null,
    limits: { maxStacks: settings.maxStacksPerSide, maxOpen: settings.maxOpenPerUser, expiryHours: settings.expiryHours },
    // The viewer's own editions by collection entry ({ id, n: edition number, uid? }, lowest first), so they can pick which ones move; {} while editions are not numbered.
    prints,
    // Serial numbers of the viewer's editions they have favourited: the panel shows those disabled (the engine refuses them).
    favourites: prefs.favourites,
    // Staff badges (login -> 'streamer' | 'admin' | 'mod') for the people named in the offers.
    badges: await getStaffBadges(),
    incoming: incoming.map(view),
    outgoing: outgoing.map(view),
    board: board.map(view),
    recent: recent.map(view),
  });
}

/**
 * Make an offer, or answer / cancel one. Body: { action: 'create' | 'accept' | 'decline' | 'cancel' | 'counter', ... }.
 * `give` items may carry `ids` (exact edition ids, ROADMAP 6.4) and accept may carry `getIds`; both are checked by the engine.
 */
export async function POST(req: NextRequest) {
  const viewer = await extensionViewer(req);
  if ('response' in viewer) return viewer.response;
  const me = viewer.username;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';

  try {
    switch (body.action) {
      case 'create': {
        const kind = body.kind === 'direct' ? 'direct' : 'listing';
        const season = await getActiveSeason();
        if (!season) return NextResponse.json({ error: 'There is no active season.' }, { status: 400 });
        return respond(await createTrade({
          seasonId: season.id, from: me, kind,
          to: kind === 'direct' && typeof body.to === 'string' ? body.to.replace(/^@/, '').trim() : undefined,
          give: body.give, get: body.get,
          note: typeof body.note === 'string' ? body.note : undefined,
        }));
      }
      case 'accept': {
        // Optional: the editions the viewer picked for what the offer asks, { <collection entry>: [edition ids] } (absent = newest first).
        const getIds = parseGetIds(body.getIds);
        if (getIds === null) return NextResponse.json({ error: 'getIds must map each card to a list of edition ids' }, { status: 400 });
        return respond(await acceptTrade(id, me, getIds));
      }
      case 'decline': return respond(await declineTrade(id, me));
      case 'counter': return respond(await counterTrade(id, me, { give: body.give, get: body.get, note: typeof body.note === 'string' ? body.note : undefined }));
      case 'cancel': return respond(await cancelTrade(id, me));
      default: return NextResponse.json({ error: 'action must be create, accept, decline, cancel or counter' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'That did not work' }, { status: 503 });
  }
}
