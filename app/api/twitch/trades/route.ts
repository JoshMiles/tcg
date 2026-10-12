import { NextRequest, NextResponse } from 'next/server';
import { getActiveSeason, getCollection } from '@/lib/kv';
import { acceptTrade, cancelTrade, createTrade, declineTrade, getTradeSettings, sweepTrades, tradesForUser, listOpenTrades } from '@/lib/trades';
import { firstMissing, type Trade } from '@/lib/trade-core';
import { getTradeCards, getTradePools, poolsFor, stackPoints } from '@/lib/trade-view';
import { extensionViewer } from '@/lib/twitch-viewer';
import { respond } from '@/lib/trade-api';

export const dynamic = 'force-dynamic';

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

  const [settings, cards, mine, open, data] = await Promise.all([
    getTradeSettings(), getTradeCards(season), tradesForUser(me), listOpenTrades(), getCollection(season.collectionName),
  ]);
  const here = (list: Trade[]) => list.filter(t => t.seasonId === season.id);
  const incoming = here(mine.incoming);
  const outgoing = here(mine.outgoing);
  const board = here(open.filter(t => t.kind === 'listing' && t.from !== me)).slice(0, BOARD_MAX);
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
    };
  };

  return NextResponse.json({
    username: me,
    seasonId: season.id,
    enabled: settings.enabled && !season.tradingFrozen,
    closedReason: !settings.enabled ? 'Trading is paused right now.' : season.tradingFrozen ? 'Trading is closed for this season.' : null,
    limits: { maxStacks: settings.maxStacksPerSide, maxOpen: settings.maxOpenPerUser, expiryHours: settings.expiryHours },
    incoming: incoming.map(view),
    outgoing: outgoing.map(view),
    board: board.map(view),
    recent: recent.map(view),
  });
}

/** Make an offer, or answer / cancel one. Body: { action: 'create' | 'accept' | 'decline' | 'cancel', ... }. */
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
      case 'accept': return respond(await acceptTrade(id, me));
      case 'decline': return respond(await declineTrade(id, me));
      case 'cancel': return respond(await cancelTrade(id, me));
      default: return NextResponse.json({ error: 'action must be create, accept, decline or cancel' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'That did not work' }, { status: 503 });
  }
}
