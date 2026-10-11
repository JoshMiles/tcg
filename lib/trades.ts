import { kv } from './db';
import { getCollection, getPackCards, getPacksForSeason, getSeason, getUserProfile, saveCollection, withCollectionLock, withLock } from './kv';
import { recordActivity } from './activity';
import { allowedVariants } from './variants';
import {
  DEFAULT_TRADE_SETTINGS, TRADE_LIMITS, cleanItems, itemCopies, itemEntries, sanitizeTradeSettings, settleTrade, takeForEscrow,
  describeItems, type Trade, type TradeItem, type TradeSettings, type TradeStatus,
} from './trade-core';
import type { Card, Pack } from './types';

// Trading engine (server). See lib/trade-core.ts for the model. Storage (all through the namespaced `kv`, so sandboxes work):
//   trades:open     Trade[]  every open offer (one blob, mutated under the 'trades' lock, like a collection)
//   trades:history  Trade[]  resolved offers, newest first, capped
//   trade:settings  TradeSettings
//   trade:cd:<user> a short-lived key that enforces the cooldown between offers
// ESCROW: creating an offer moves the offered copies out of the offerer's collection into the trade; every way an offer can end
// either settles them to the other side (accept) or refunds them (everything else). Lock order is always 'trades' then a
// collection's lock, and nothing takes them the other way round.

const OPEN_KEY = 'trades:open';
const HISTORY_KEY = 'trades:history';
const SETTINGS_KEY = 'trade:settings';
const HISTORY_CAP = 400;
const LOCK = 'trades';

export type TradeResult<T = object> = ({ ok: true } & T) | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

// ── settings ──────────────────────────────────────────────

export async function getTradeSettings(): Promise<TradeSettings> {
  return sanitizeTradeSettings(await kv.get(SETTINGS_KEY).catch(() => null) ?? DEFAULT_TRADE_SETTINGS);
}

export async function saveTradeSettings(settings: TradeSettings): Promise<void> {
  await kv.set(SETTINGS_KEY, sanitizeTradeSettings(settings));
}

// ── storage helpers (call inside the 'trades' lock when they will be written back) ──

const readOpen = async (): Promise<Trade[]> => (await kv.get<Trade[]>(OPEN_KEY)) ?? [];
const readHistory = async (): Promise<Trade[]> => (await kv.get<Trade[]>(HISTORY_KEY)) ?? [];

async function seasonContext(seasonId: string) {
  const season = await getSeason(seasonId);
  if (!season || season.status === 'draft') return null;
  const packs = await getPacksForSeason(season);
  const cardMap = new Map<number, { pack: Pack; card: Card }>();
  for (const pack of packs) for (const card of await getPackCards(pack.id)) cardMap.set(card.number, { pack, card });
  return { season, cardMap };
}

/** Puts copies back into a viewer's collection (a refund). Safe to call once per escrow: callers flip `escrowed` first. */
async function returnToCollection(seasonId: string, username: string, items: TradeItem[]): Promise<void> {
  const season = await getSeason(seasonId);
  if (!season) return; // the season is gone: nothing to refund into
  await withCollectionLock(season.collectionName, async () => {
    const data = await getCollection(season.collectionName);
    data[username] = [...(data[username] ?? []), ...itemEntries(items)];
    await saveCollection(season.collectionName, data);
  });
}

/** Ends an offer: refunds its escrow (unless it is being settled), records why, and moves it to history. */
async function closeTrade(open: Trade[], history: Trade[], trade: Trade, status: TradeStatus, by: string | undefined, reason?: string, refund = true): Promise<void> {
  if (refund && trade.escrowed) {
    await returnToCollection(trade.seasonId, trade.from, trade.give);
    trade.escrowed = false;
  }
  trade.status = status;
  trade.resolvedAt = Date.now();
  if (by) trade.resolvedBy = by;
  if (reason) trade.reason = reason;
  const i = open.findIndex(t => t.id === trade.id);
  if (i >= 0) open.splice(i, 1);
  history.unshift(trade);
  if (history.length > HISTORY_CAP) history.length = HISTORY_CAP;
}

/** Expires (and refunds) every overdue open offer. Returns whether anything changed. Call inside the lock. */
async function sweepInLock(open: Trade[], history: Trade[]): Promise<boolean> {
  const now = Date.now();
  const overdue = open.filter(t => t.expiresAt <= now);
  for (const t of overdue) await closeTrade(open, history, t, 'expired', undefined, 'The offer ran out of time.');
  return overdue.length > 0;
}

async function persist(open: Trade[], history: Trade[]): Promise<void> {
  await kv.set(OPEN_KEY, open);
  await kv.set(HISTORY_KEY, history);
}

/**
 * Refunds offers that have expired. There is no background job, so this runs whenever anyone touches trading (the trade pages,
 * the account page, a collection page): an expired offer's copies are back with their owner by the time they look.
 */
export async function sweepTrades(): Promise<number> {
  const peek = await readOpen();
  const now = Date.now();
  if (!peek.some(t => t.expiresAt <= now)) return 0; // the common case costs one read and no lock
  return withLock(LOCK, async () => {
    const open = await readOpen();
    const history = await readHistory();
    const before = open.length;
    await sweepInLock(open, history);
    await persist(open, history);
    return before - open.length;
  });
}

// ── reading ───────────────────────────────────────────────

/** All open offers (after refunding expired ones). */
export async function listOpenTrades(): Promise<Trade[]> {
  await sweepTrades();
  return readOpen();
}

export async function getTrade(id: string): Promise<Trade | null> {
  const open = await listOpenTrades();
  return open.find(t => t.id === id) ?? (await readHistory()).find(t => t.id === id) ?? null;
}

export async function tradeHistory(): Promise<Trade[]> {
  return readHistory();
}

/** One viewer's trades, split the way the page shows them. */
export async function tradesForUser(username: string): Promise<{ incoming: Trade[]; outgoing: Trade[]; board: Trade[]; recent: Trade[] }> {
  const user = username.toLowerCase();
  const open = await listOpenTrades();
  const history = await readHistory();
  return {
    incoming: open.filter(t => t.kind === 'direct' && t.to === user),
    outgoing: open.filter(t => t.from === user),
    // Other people's listings the viewer could take (their own are under "outgoing").
    board: open.filter(t => t.kind === 'listing' && t.from !== user),
    recent: history.filter(t => t.from === user || t.to === user || t.resolvedBy === user).slice(0, 30),
  };
}

// ── making offers ─────────────────────────────────────────

export interface NewTrade {
  seasonId: string;
  from: string;
  kind: 'direct' | 'listing';
  to?: string;
  give: unknown;
  get: unknown;
  note?: string;
}

/** Shared by new offers and counters: validates, escrows `give` out of the offerer's collection and stores the offer. */
async function createInLock(input: NewTrade, settings: TradeSettings, open: Trade[], history: Trade[], counterOf?: string): Promise<TradeResult<{ trade: Trade }>> {
  const from = input.from.toLowerCase();
  const to = input.to?.toLowerCase();
  if (input.kind === 'direct') {
    if (!to) return fail(400, 'Choose who the offer is for.');
    if (to === from) return fail(400, 'You can\'t trade with yourself.');
  }

  const ctx = await seasonContext(input.seasonId);
  if (!ctx) return fail(404, 'That season isn\'t available for trading.');
  const { season, cardMap } = ctx;

  const give = cleanItems(input.give, settings.maxStacksPerSide);
  const get = cleanItems(input.get, settings.maxStacksPerSide);
  if (!give) return fail(400, `Choose between 1 and ${settings.maxStacksPerSide} different cards to give (up to ${TRADE_LIMITS.copiesPerStack} copies of each).`);
  if (!get) return fail(400, `Choose between 1 and ${settings.maxStacksPerSide} different cards you want back.`);
  // Wanted cards must exist, and a wanted variant must be one the card can actually be in this pack.
  for (const item of get) {
    const hit = cardMap.get(item.cardNumber);
    if (!hit) return fail(400, `Card #${item.cardNumber} isn't in this season.`);
    if (item.variant !== 'regular' && (!hit.pack.upgradesEnabled || !allowedVariants(hit.pack, hit.card).includes(item.variant))) {
      return fail(400, `${hit.card.name} can't be a ${item.variant} in this season.`);
    }
  }

  if (open.filter(t => t.from === from).length >= settings.maxOpenPerUser) {
    return fail(429, `You already have ${settings.maxOpenPerUser} open offers. Cancel one or wait for it to be answered.`);
  }
  if (settings.cooldownSeconds > 0 && (await kv.get(`trade:cd:${from}`))) {
    return fail(429, 'Slow down: wait a few seconds before making another offer.');
  }
  if (input.kind === 'direct' && to) {
    const data = await getCollection(season.collectionName);
    if (!(to in data) && !(await getUserProfile(to))) return fail(404, `Nobody called ${to} has played yet.`);
  }

  // Escrow: take the offered copies out of the offerer's collection, then record the offer. If recording fails, put them back.
  const trade: Trade = {
    id: crypto.randomUUID(),
    seasonId: season.id,
    kind: input.kind,
    from,
    ...(input.kind === 'direct' ? { to } : {}),
    give,
    escrowed: true,
    get,
    ...(input.note && input.note.trim() ? { note: input.note.trim().slice(0, TRADE_LIMITS.noteLength) } : {}),
    status: 'open',
    createdAt: Date.now(),
    expiresAt: Date.now() + settings.expiryHours * 3_600_000,
    ...(counterOf ? { counterOf } : {}),
  };
  const taken = await withCollectionLock(season.collectionName, async () => {
    const data = await getCollection(season.collectionName);
    const res = takeForEscrow(data[from] ?? [], give);
    if (!res.ok) return res;
    data[from] = res.rest;
    await saveCollection(season.collectionName, data);
    return res;
  });
  if (!taken.ok) {
    const card = cardMap.get(taken.missing.cardNumber)?.card.name ?? `#${taken.missing.cardNumber}`;
    return fail(400, `You don't have ${taken.missing.count}× ${card} (${taken.missing.variant}) to offer.`);
  }
  try {
    open.unshift(trade);
    await persist(open, history);
  } catch (e) {
    await returnToCollection(season.id, from, give); // never lose the copies
    throw e;
  }
  if (settings.cooldownSeconds > 0) await kv.set(`trade:cd:${from}`, '1', { ex: settings.cooldownSeconds });
  return { ok: true, trade };
}

export async function createTrade(input: NewTrade): Promise<TradeResult<{ trade: Trade }>> {
  const settings = await getTradeSettings();
  if (!settings.enabled) return fail(403, 'Trading is paused right now.');
  return withLock(LOCK, async () => {
    const open = await readOpen();
    const history = await readHistory();
    await sweepInLock(open, history);
    return createInLock(input, settings, open, history);
  });
}

// ── answering offers ──────────────────────────────────────

async function findOpen(id: string): Promise<{ open: Trade[]; history: Trade[]; trade: Trade } | { error: ReturnType<typeof fail> }> {
  const open = await readOpen();
  const history = await readHistory();
  await sweepInLock(open, history);
  const trade = open.find(t => t.id === id);
  if (!trade) {
    await persist(open, history);
    return { error: fail(404, 'That offer is no longer open.') };
  }
  return { open, history, trade };
}

/** Accept: the taker hands over what the offerer wanted and receives the escrowed copies. */
export async function acceptTrade(id: string, username: string): Promise<TradeResult<{ trade: Trade }>> {
  const taker = username.toLowerCase();
  const settings = await getTradeSettings();
  if (!settings.enabled) return fail(403, 'Trading is paused right now.');
  return withLock(LOCK, async () => {
    const found = await findOpen(id);
    if ('error' in found) return found.error;
    const { open, history, trade } = found;
    if (taker === trade.from) return fail(400, 'You can\'t accept your own offer.');
    if (trade.kind === 'direct' && trade.to !== taker) return fail(403, 'That offer is for someone else.');
    const season = await getSeason(trade.seasonId);
    if (!season) return fail(404, 'That season no longer exists.');

    const result = await withCollectionLock(season.collectionName, async () => {
      const data = await getCollection(season.collectionName);
      const settled = settleTrade(data[trade.from] ?? [], data[taker] ?? [], trade.give, trade.get);
      if (!settled.ok) return settled;
      data[trade.from] = settled.offerer;
      data[taker] = settled.taker;
      await saveCollection(season.collectionName, data);
      return settled;
    });
    if (!result.ok) {
      return fail(400, `You don't have ${result.missing.count}× card #${result.missing.cardNumber} (${result.missing.variant}) that this offer asks for.`);
    }
    // The escrow has been handed over, so close without refunding.
    trade.escrowed = false;
    await closeTrade(open, history, trade, 'accepted', taker, undefined, false);
    await persist(open, history);
    await recordActivity({ type: 'trade', username: trade.from, partner: taker, gave: itemCopies(trade.give), got: itemCopies(trade.get), collectionName: season.collectionName });
    return { ok: true, trade };
  });
}

/** The recipient says no: the offerer's copies are refunded. */
export async function declineTrade(id: string, username: string): Promise<TradeResult<{ trade: Trade }>> {
  const user = username.toLowerCase();
  return withLock(LOCK, async () => {
    const found = await findOpen(id);
    if ('error' in found) return found.error;
    const { open, history, trade } = found;
    if (trade.kind !== 'direct' || trade.to !== user) return fail(403, 'Only the person it was offered to can decline it.');
    await closeTrade(open, history, trade, 'declined', user);
    await persist(open, history);
    return { ok: true, trade };
  });
}

/** The offerer withdraws (or an admin cancels): the copies are refunded. Works even while trading is paused. */
export async function cancelTrade(id: string, username: string, opts: { admin?: boolean; reason?: string } = {}): Promise<TradeResult<{ trade: Trade }>> {
  const user = username.toLowerCase();
  return withLock(LOCK, async () => {
    const found = await findOpen(id);
    if ('error' in found) return found.error;
    const { open, history, trade } = found;
    if (!opts.admin && trade.from !== user) return fail(403, 'You can only cancel your own offers.');
    await closeTrade(open, history, trade, 'cancelled', opts.admin ? 'admin' : user, opts.reason);
    await persist(open, history);
    return { ok: true, trade };
  });
}

/**
 * Counter-offer: the recipient of a direct offer answers with a different one. The original is closed as 'countered' (its
 * escrow refunded to its offerer) and the new offer, escrowing the counter-offerer's copies, goes back to the original offerer.
 */
export async function counterTrade(id: string, username: string, input: { give: unknown; get: unknown; note?: string }): Promise<TradeResult<{ trade: Trade }>> {
  const user = username.toLowerCase();
  const settings = await getTradeSettings();
  if (!settings.enabled) return fail(403, 'Trading is paused right now.');
  return withLock(LOCK, async () => {
    const found = await findOpen(id);
    if ('error' in found) return found.error;
    const { open, history, trade } = found;
    if (trade.kind !== 'direct' || trade.to !== user) return fail(403, 'You can only counter an offer made to you.');
    // Make the counter first (it can fail validation); only then retire the original.
    const created = await createInLock({ seasonId: trade.seasonId, from: user, kind: 'direct', to: trade.from, give: input.give, get: input.get, note: input.note }, settings, open, history, trade.id);
    if (!created.ok) return created;
    await closeTrade(open, history, trade, 'countered', user);
    await persist(open, history);
    return created;
  });
}

/** What a trade is, in words (for the admin log). */
export function summarizeTrade(t: Trade, nameOf?: (n: number) => string | undefined): string {
  return `${t.from} gives ${describeItems(t.give, nameOf)} for ${describeItems(t.get, nameOf)}${t.to ? ` (to ${t.to})` : ' (open listing)'}`;
}
