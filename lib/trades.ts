import { protectFavourites } from './favourites';
import { escrowOwner, isEscrow, entryOf, newestFirst, parseCopyId } from './serials-core';
import { firstNotHeld, getCopy, getOwnerCopies, isTracking, liveCopiesOfEntry, printLabel, serialPool } from './serials';
import { getUserSettings } from './user-settings-store';
import { kv } from './db';
import { getCollection, getPackCards, getPacksForSeason, getSeason, getUserProfile, saveCollection, withCollectionLock, withLock } from './kv';
import { announceTrade, type EventPools, type TradeAction } from './trade-notify';
import { currentStaffLogin } from './staff-actor';
import { allowedVariants, encodeEntry, removeEntries } from './variants';
import {
  DEFAULT_TRADE_SETTINGS, TRADE_LIMITS, cleanItems, itemEntries, sanitizeTradeSettings, settleTrade, takeForEscrow,
  describeItems, hasPickedPrints, moveOf, withChosenPrints, type Trade, type TradeItem, type TradeSettings, type TradeStatus,
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

// Notifications / activity for what happens to offers are queued while the trade lock is held and sent after it is released
// (building them reads the season and its card values, which must not delay the lock). Whoever flushes first sends everything queued.
const queued: { trade: Trade; action: TradeAction; by?: string; pools?: EventPools }[] = [];
function queueEvent(trade: Trade, action: TradeAction, by?: string, pools?: EventPools): void {
  queued.push({ trade: structuredClone(trade), action, by, pools });
}
/** The serials on each side of an offer right now (call before the copies move): `give` from the escrow, `get` from whoever would hand it over. */
async function snapshotPools(seasonId: string, owners: { give?: string; get?: string }): Promise<EventPools> {
  try {
    const c = (await getSeason(seasonId))?.collectionName;
    if (!c) return {};
    const [give, get] = await Promise.all([owners.give ? serialPool(c, owners.give) : undefined, owners.get ? serialPool(c, owners.get) : undefined]);
    return { give, get };
  } catch { return {}; }
}
async function flushEvents(): Promise<void> {
  const batch = queued.splice(0, queued.length);
  for (const e of batch) await announceTrade(e.trade, e.action, e.by, e.pools);
}
/** Runs a locked section, then sends the notifications it queued. */
function locked<T>(fn: () => Promise<T>): Promise<T> {
  return withLock(LOCK, fn).finally(flushEvents);
}

/** Moderation: is this viewer barred from trading? (reads the profile directly; lib/user-admin.ts imports this module) */
async function blocked(username: string): Promise<boolean> {
  try { return !!(await getUserProfile(username))?.flags?.noTrading; } catch { return false; }
}

/** True while the viewer's profile is younger than the "minimum account age" setting (a viewer with no profile counts as new). */
async function tooNew(username: string, settings: TradeSettings): Promise<boolean> {
  if (settings.minAccountHours <= 0) return false;
  try {
    const created = (await getUserProfile(username))?.createdAt;
    return !created || Date.now() - created < settings.minAccountHours * 3_600_000;
  } catch { return false; }
}

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

/**
 * Prints still sitting with this offer's escrow, when the season is numbered.
 * Null when it is not numbered (the caller then returns every stack, as before).
 */
async function heldEscrowEntries(c: string, tradeId: string, items: TradeItem[]): Promise<{ entries: number[]; moves: { from: string; to: string; entry: number; count: number; ids: string[] }[] } | null> {
  if (!(await isTracking(c))) return null;
  const from = escrowOwner(tradeId);
  const held = await getOwnerCopies(c, from);
  const entries: number[] = [];
  const moves: { from: string; to: string; entry: number; count: number; ids: string[] }[] = [];
  for (const item of items) {
    const entry = encodeEntry(item.cardNumber, item.variant);
    const mine = held.filter(x => entryOf(x) === entry);
    const picked = item.ids ? mine.filter(x => item.ids!.includes(x.id)) : mine.slice(0, item.count);
    if (picked.length === 0) continue;
    const ids = picked.map(x => x.id);
    entries.push(...Array<number>(picked.length).fill(entry));
    moves.push({ from, to: '', entry, count: picked.length, ids });
  }
  return { entries, moves };
}

/**
 * Puts copies back into a viewer's collection (a refund). Returns false when the season record is gone:
 * nothing was written and the caller must leave `escrowed` set. When the season is numbered, only prints
 * still held by this offer's escrow are appended, so a second call does not mint another set.
 */
async function returnToCollection(seasonId: string, username: string, items: TradeItem[], tradeId?: string): Promise<boolean> {
  const season = await getSeason(seasonId);
  if (!season) return false;
  await withCollectionLock(season.collectionName, async () => {
    const partial = tradeId ? await heldEscrowEntries(season.collectionName, tradeId, items) : null;
    const entries = partial ? partial.entries : itemEntries(items);
    if (entries.length === 0) return;
    const data = await getCollection(season.collectionName);
    data[username] = [...(data[username] ?? []), ...entries];
    const moves = tradeId
      ? (partial ? partial.moves.map(m => ({ ...m, to: username })) : items.map(i => ({ from: escrowOwner(tradeId), to: username, ...moveOf(i) })))
      : undefined;
    await saveCollection(season.collectionName, data, moves ? { moves } : undefined);
  });
  return true;
}

/** Ends an offer: refunds its escrow (unless it is being settled), records why, and moves it to history. */
async function closeTrade(open: Trade[], history: Trade[], trade: Trade, status: TradeStatus, by: string | undefined, reason?: string, refund = true, settledPools?: EventPools): Promise<void> {
  // A refund puts the escrowed copies back with the offerer, so price the give side from the escrow before that happens.
  const pools = settledPools ?? (trade.escrowed ? await snapshotPools(trade.seasonId, { give: escrowOwner(trade.id) }) : undefined);
  trade.status = status;
  trade.resolvedAt = Date.now();
  if (by) trade.resolvedBy = by;
  if (reason) trade.reason = reason;
  if (by === 'admin') { const staff = await currentStaffLogin(); if (staff) trade.staff = staff; }
  const i = open.findIndex(t => t.id === trade.id);
  if (i >= 0) open.splice(i, 1);
  history.unshift(trade);
  if (history.length > HISTORY_CAP) history.length = HISTORY_CAP;
  const needsRefund = refund && trade.escrowed;
  if (needsRefund) {
    // KV has no multi-key transaction: save the offer as closed (still marked escrowed) BEFORE the copies move. If the refund
    // then fails, the offer can't be refunded twice; Data health lists it as stuck in escrow. A missing season is not a refund.
    await persist(open, history);
    if (await returnToCollection(trade.seasonId, trade.from, trade.give, trade.id)) trade.escrowed = false;
  }
  // (a counter is announced by the new offer it creates). Skip the notice when the prints did not actually come back.
  if ((status === 'accepted' || status === 'declined' || status === 'cancelled' || status === 'expired') && !(needsRefund && trade.escrowed)) queueEvent(trade, status, by, pools);
}

/**
 * Expires (and refunds) every overdue open offer. Returns whether anything changed. Call inside the lock.
 * Persists before returning: closeTrade clears `escrowed` only in memory, and several callers return early after this.
 */
async function sweepInLock(open: Trade[], history: Trade[]): Promise<boolean> {
  const now = Date.now();
  const overdue = open.filter(t => t.expiresAt <= now);
  for (const t of overdue) await closeTrade(open, history, t, 'expired', undefined, 'The offer ran out of time.');
  if (overdue.length > 0) await persist(open, history);
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
  return locked(async () => {
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
  // Moderation: a restricted viewer can't make offers, and can't be offered one.
  if (await blocked(from)) return fail(403, 'Trading isn\'t available on your account.');
  if (input.kind === 'direct' && input.to && (await blocked(String(input.to).toLowerCase()))) return fail(403, 'That viewer can\'t take part in trades.');
  // A viewer can stop taking direct offers (the open board and counter-offers to their own offers still work).
  if (input.kind === 'direct' && input.to && !counterOf && !(await getUserSettings(String(input.to))).allowOffers) return fail(403, 'That viewer isn\'t taking trade offers right now.');
  if (await tooNew(from, settings)) return fail(403, `Trading opens ${settings.minAccountHours} hours after you first play.`);

  const ctx = await seasonContext(input.seasonId);
  if (!ctx) return fail(404, 'That season isn\'t available for trading.');
  const { season, cardMap } = ctx;
  if (season.tradingFrozen) return fail(403, 'Trading is closed for this season.');

  let give = cleanItems(input.give, settings.maxStacksPerSide);
  const get = cleanItems(input.get, settings.maxStacksPerSide);
  if (!give) return fail(400, `Choose between 1 and ${settings.maxStacksPerSide} different cards to give (up to ${TRADE_LIMITS.copiesPerStack} prints of each).`);
  if (!get) return fail(400, `Choose between 1 and ${settings.maxStacksPerSide} different cards you want back.`);
  // Wanted cards must exist, and a wanted variant must be one the card can actually be in this pack.
  for (const item of get) {
    const hit = cardMap.get(item.cardNumber);
    if (!hit) return fail(400, `Card #${item.cardNumber} isn't in this season.`);
    if (item.variant !== 'regular' && (!hit.pack.upgradesEnabled || !allowedVariants(hit.pack, hit.card).includes(item.variant))) {
      return fail(400, `${hit.card.name} can't be a ${item.variant} in this season.`);
    }
  }

  // Exact prints need a numbered ledger, and only a direct offer can ask for the other person's exact prints (a listing is taken by a stranger who picks at accept).
  if (hasPickedPrints(give) || hasPickedPrints(get)) {
    if (!(await isTracking(season.collectionName))) return fail(400, 'Prints in this season are not numbered yet, so you can\'t choose which ones to trade.');
    if (input.kind === 'listing' && hasPickedPrints(get)) return fail(400, 'A listing can\'t ask for exact prints: whoever takes it chooses theirs.');
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
    // Asked-for prints must be the recipient's right now (a counter may ask for prints still sitting in the offer it answers).
    for (const item of get) {
      if (!item.ids) continue;
      const gone = await firstNotHeld(season.collectionName, counterOf ? [to, escrowOwner(counterOf)] : [to], item.ids);
      if (gone) return fail(400, `${to} doesn't hold ${await printLabel(season.collectionName, gone.id)} any more.`);
    }
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
    // Favourite prints never go into an offer: unpicked stacks are pinned to the newest prints that are not favourites.
    const safe = await protectFavourites(season.collectionName, from, give!);
    if (!safe.ok) return { ok: false as const, text: safe.text };
    give = safe.items;
    trade.give = give;
    const res = takeForEscrow(data[from] ?? [], give);
    if (!res.ok) return res;
    // Picked prints must be this viewer's own, right now: not sold, forged or already put up in another offer.
    for (const item of give) {
      if (!item.ids) continue;
      const gone = await firstNotHeld(season.collectionName, [from], item.ids);
      if (gone) return { ok: false as const, text: `${await printLabel(season.collectionName, gone.id)} ${isEscrow(gone.holder) ? 'is already in another trade offer.' : 'isn\'t yours any more.'}` };
    }
    data[from] = res.rest;
    await saveCollection(season.collectionName, data, { moves: give.map(i => ({ from, to: escrowOwner(trade.id), ...moveOf(i) })) });
    return res;
  });
  if (!taken.ok && 'text' in taken) return fail(400, taken.text);
  if (!taken.ok) {
    const card = cardMap.get(taken.missing.cardNumber)?.card.name ?? `#${taken.missing.cardNumber}`;
    return fail(400, `You don't have ${taken.missing.count}× ${card} (${taken.missing.variant}) to offer.`);
  }
  // History was already saved by the sweep (or was unchanged). Write only the open list: a throw then means this offer
  // was not stored, so putting the prints back cannot leave them on the open list as well.
  open.unshift(trade);
  try {
    await kv.set(OPEN_KEY, open);
  } catch (e) {
    open.shift();
    await returnToCollection(season.id, from, give, trade.id);
    throw e;
  }
  if (settings.cooldownSeconds > 0) await kv.set(`trade:cd:${from}`, '1', { ex: settings.cooldownSeconds });
  queueEvent(trade, 'offered', from, await snapshotPools(trade.seasonId, { give: escrowOwner(trade.id) }));
  return { ok: true, trade };
}

export async function createTrade(input: NewTrade): Promise<TradeResult<{ trade: Trade }>> {
  const settings = await getTradeSettings();
  if (!settings.enabled) return fail(403, 'Trading is paused right now.');
  return locked(async () => {
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
export async function acceptTrade(id: string, username: string, getIds?: Record<string, string[]>): Promise<TradeResult<{ trade: Trade }>> {
  const taker = username.toLowerCase();
  const settings = await getTradeSettings();
  if (!settings.enabled) return fail(403, 'Trading is paused right now.');
  return locked(async () => {
    const found = await findOpen(id);
    if ('error' in found) return found.error;
    const { open, history, trade } = found;
    if (taker === trade.from) return fail(400, 'You can\'t accept your own offer.');
    if (trade.kind === 'direct' && trade.to !== taker) return fail(403, 'That offer is for someone else.');
    if ((await blocked(taker)) || (await blocked(trade.from))) return fail(403, 'Trading isn\'t available for this trade.');
    if (await tooNew(taker, settings)) return fail(403, `Trading opens ${settings.minAccountHours} hours after you first play.`);
    const season = await getSeason(trade.seasonId);
    if (!season) return fail(404, 'That season no longer exists.');
    if (season.tradingFrozen) return fail(403, 'Trading is closed for this season.');

    // Prints the taker chose for what the offer asks (the offerer may have pinned some already).
    let get = withChosenPrints(trade.get, getIds);
    if (!get) return fail(400, 'Those prints don\'t match what the offer asks for.');
    if (hasPickedPrints(get) && !(await isTracking(season.collectionName))) return fail(400, 'Prints in this season are not numbered yet, so they can\'t be chosen.');

    // Read the serials on both sides before the copies change hands (picked prints are priced from their own ids).
    const pools = await snapshotPools(trade.seasonId, { give: escrowOwner(trade.id), get: taker });
    let moved: Trade['moved'];
    const result = await withCollectionLock(season.collectionName, async () => {
      const data = await getCollection(season.collectionName);
      // The taker's favourite prints stay put: picked ones are refused, unpicked stacks skip them. The offer stays open.
      const safe = await protectFavourites(season.collectionName, taker, get!);
      if (!safe.ok) return { ok: false as const, text: safe.text };
      get = safe.items;
      const settled = settleTrade(data[trade.from] ?? [], data[taker] ?? [], trade.give, get);
      if (!settled.ok) return settled;
      // Exact prints must still be the taker's: if one moved since the offer was made, the offer stays open for a counter.
      for (const item of get) {
        if (!item.ids) continue;
        const gone = await firstNotHeld(season.collectionName, [taker], item.ids);
        if (!gone) continue;
        const pinned = trade.get.some(t => t.cardNumber === item.cardNumber && t.variant === item.variant && t.ids);
        return { ok: false as const, text: `${pinned ? 'That offer asks for' : 'You chose'} ${await printLabel(season.collectionName, gone.id)}, which you no longer hold.` };
      }
      moved = await movedPrints(season.collectionName, escrowOwner(trade.id), trade.give, taker, get!);
      data[trade.from] = settled.offerer;
      data[taker] = settled.taker;
      // Close the offer (still marked escrowed) before the copies move, so a failure in between can't refund it later (see closeTrade).
      trade.get = get!;
      if (moved) trade.moved = moved;
      await closeTrade(open, history, trade, 'accepted', taker, undefined, false, pools);
      await persist(open, history);
      // Identity follows the cards: the offer's copies leave escrow for the taker, the asked-for copies go to the offerer.
      await saveCollection(season.collectionName, data, { moves: [
        ...trade.give.map(i => ({ from: escrowOwner(trade.id), to: taker, ...moveOf(i) })),
        ...get.map(i => ({ from: taker, to: trade.from, ...moveOf(i) })),
      ] });
      return settled;
    });
    if (!result.ok && 'text' in result) return fail(400, result.text);
    if (!result.ok) {
      return fail(400, `You don't have ${result.missing.count}× card #${result.missing.cardNumber} (${result.missing.variant}) that this offer asks for.`);
    }
    // The escrow has been handed over. The record keeps the exact prints that came back.
    trade.escrowed = false;
    await persist(open, history);
    return { ok: true, trade };
  });
}

/** The exact prints a settlement is about to move (read before they do): the escrow's for `give`, the taker's for `get`. Undefined when the season's prints are not numbered. */
async function movedPrints(c: string, escrow: string, give: TradeItem[], taker: string, get: TradeItem[]): Promise<Trade['moved']> {
  if (!(await isTracking(c))) return undefined;
  const pick = async (owner: string, items: TradeItem[]) => {
    const have = await getOwnerCopies(c, owner);
    return items.flatMap(i => i.ids ?? newestFirst(have.filter(x => entryOf(x) === encodeEntry(i.cardNumber, i.variant)), i.count).map(x => x.id));
  };
  return { give: await pick(escrow, give), get: await pick(taker, get) };
}

/** The recipient says no: the offerer's copies are refunded. */
export async function declineTrade(id: string, username: string): Promise<TradeResult<{ trade: Trade }>> {
  const user = username.toLowerCase();
  return locked(async () => {
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
  return locked(async () => {
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
  return locked(async () => {
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

/**
 * Staff return the prints of one closed offer that is still marked escrowed, then clear the flag.
 * Idempotent: a second call finds the flag clear and does nothing. When the season is numbered, only prints
 * still in that offer's escrow are moved, so a flag that outlived the refund does not mint a second set.
 * When the season record is gone, the flag stays set.
 */
export async function releaseStuckEscrow(id: string): Promise<TradeResult<{ trade: Trade; cleared: boolean }>> {
  return locked(async () => {
    const open = await readOpen();
    const history = await readHistory();
    const trade = history.find(t => t.id === id);
    if (!trade) return fail(404, "That offer isn't in the history.");
    if (open.some(t => t.id === id)) return fail(400, 'That offer is still open. Cancel it so the prints come back.');
    if (!trade.escrowed) return { ok: true, trade, cleared: false };
    if (!(await returnToCollection(trade.seasonId, trade.from, trade.give, trade.id))) {
      return fail(400, 'That season no longer exists, so the prints cannot be returned. The offer stays marked escrowed.');
    }
    trade.escrowed = false;
    await persist(open, history);
    return { ok: true, trade, cleared: true };
  });
}

/** What a trade is, in words (for the admin log). */
export function summarizeTrade(t: Trade, nameOf?: (n: number) => string | undefined): string {
  return `${t.from} gives ${describeItems(t.give, nameOf)} for ${describeItems(t.get, nameOf)}${t.to ? ` (to ${t.to})` : ' (open listing)'}`;
}

/** How many trades (open and finished, in the kept history) each viewer has been part of: for the admin users list. */
export async function tradeCountsByUser(): Promise<Record<string, { total: number; open: number; completed: number }>> {
  const [open, history] = await Promise.all([readOpen(), readHistory()]);
  const out: Record<string, { total: number; open: number; completed: number }> = {};
  const bump = (u: string | undefined, key: 'open' | 'completed' | 'other') => {
    if (!u) return;
    const e = (out[u] ??= { total: 0, open: 0, completed: 0 });
    e.total++;
    if (key === 'open') e.open++;
    if (key === 'completed') e.completed++;
  };
  for (const t of open) { bump(t.from, 'open'); bump(t.to, 'open'); }
  for (const t of history) {
    const done = t.status === 'accepted';
    bump(t.from, done ? 'completed' : 'other');
    bump(t.to ?? (done ? t.resolvedBy : undefined), done ? 'completed' : 'other');
  }
  return out;
}

// ── admin bulk controls ───────────────────────────────────

/** Cancels (and refunds) every open offer that matches, in one locked pass. Returns how many ended. */
export async function cancelOpenTrades(filter: { username?: string; seasonId?: string }, reason = 'Cancelled by an admin'): Promise<number> {
  const user = filter.username?.toLowerCase();
  return locked(async () => {
    const open = await readOpen();
    const history = await readHistory();
    await sweepInLock(open, history);
    const hit = open.filter(t => (!user || t.from === user || t.to === user) && (!filter.seasonId || t.seasonId === filter.seasonId));
    for (const t of hit) await closeTrade(open, history, t, 'cancelled', 'admin', reason);
    await persist(open, history);
    return hit.length;
  });
}

/** Pushes the expiry of open offers (all, or the given ids) back by `hours` from now-or-their-current-expiry, whichever is later. */
export async function extendOpenTrades(ids: string[] | null, hours: number): Promise<number> {
  const add = Math.max(1, Math.min(24 * 14, Math.floor(hours) || 0)) * 3_600_000;
  return locked(async () => {
    const open = await readOpen();
    const history = await readHistory();
    await sweepInLock(open, history);
    let n = 0;
    for (const t of open) {
      if (ids && !ids.includes(t.id)) continue;
      t.expiresAt = Math.max(t.expiresAt, Date.now()) + add;
      n++;
    }
    await persist(open, history);
    return n;
  });
}

// ── reversing a completed trade (ROADMAP 9.2) ─────────────

const REVERSE_WINDOW = { before: 10_000, after: 1_000 }; // the ledger stamps a move a moment before the trade record is closed

/**
 * The prints an older trade moved, rebuilt from the ledger: live copies of the traded cards with a 'traded' event between the two
 * people at the time it settled. Returns null unless every stack is matched exactly (no more, no fewer), so a guess never moves anything.
 */
async function rebuildMoved(c: string, trade: Trade, taker: string): Promise<Trade['moved'] | null> {
  if (!trade.resolvedAt || !(await isTracking(c))) return null;
  const at = trade.resolvedAt;
  const side = async (items: TradeItem[], by: string, to: string): Promise<string[] | null> => {
    const out: string[] = [];
    for (const i of items) {
      const live = await liveCopiesOfEntry(c, encodeEntry(i.cardNumber, i.variant));
      if (live.length > 3000) return null;
      const hits: string[] = [];
      for (const { id } of live) {
        const copy = await getCopy(c, id);
        if (copy?.ev.some(e => e.type === 'traded' && e.who === by && e.to === to && e.t >= at - REVERSE_WINDOW.before && e.t <= at + REVERSE_WINDOW.after)) hits.push(id);
      }
      if (hits.length !== i.count) return null;
      out.push(...hits);
    }
    return out;
  };
  const give = await side(trade.give, trade.from, taker);
  const get = give && (await side(trade.get, taker, trade.from));
  return give && get ? { give, get } : null;
}

/** The first of these prints that is not with `holder` any more (or is in an open offer), in words; null when all are. */
async function stillWithReceiver(c: string, holder: string, ids: string[]): Promise<string | null> {
  const gone = await firstNotHeld(c, [holder], ids);
  if (!gone) return null;
  const label = await printLabel(c, gone.id);
  if (!gone.holder) return `${label} no longer exists.`;
  return isEscrow(gone.holder) ? `${label} is in an open offer.` : `${label} has since been traded to @${gone.holder}.`;
}

/** Can this completed trade be reversed automatically? (For the staff button: the reason it can't, or null.) */
export async function reverseBlocker(trade: Trade): Promise<string | null> {
  if (trade.status !== 'accepted') return 'Only a completed trade can be reversed.';
  if (trade.reversedAt) return 'This trade was already reversed.';
  if (trade.moved) return null;
  const season = await getSeason(trade.seasonId);
  if (!season || !trade.resolvedBy) return 'This trade is too old to reverse automatically.';
  return (await rebuildMoved(season.collectionName, trade, trade.resolvedBy)) ? null : 'This trade is too old to reverse automatically.';
}

/**
 * Staff put every print of a completed trade back where it started. All or nothing: each print must still be with the person who
 * received it and not in an open offer, otherwise nothing moves and the print that has moved on is named. The trade keeps
 * status 'accepted' and gains reversedAt / reversedBy / reverseReason; each print gets a 'reversed' event (who = staff, note = reason).
 */
export async function reverseTrade(id: string, staff: string, reason: string): Promise<TradeResult<{ trade: Trade }>> {
  const why = reason.trim().slice(0, 300);
  if (!why) return fail(400, 'Give a reason for reversing this trade.');
  return locked(async () => {
    const open = await readOpen();
    const history = await readHistory();
    const trade = history.find(t => t.id === id);
    if (!trade) return fail(404, "That trade isn't in the history.");
    if (trade.status !== 'accepted') return fail(400, 'Only a completed trade can be reversed.');
    if (trade.reversedAt) return fail(400, 'This trade was already reversed.');
    const taker = trade.resolvedBy;
    const season = await getSeason(trade.seasonId);
    if (!taker || !season) return fail(400, 'This trade is too old to reverse automatically.');
    const c = season.collectionName;
    const result = await withCollectionLock(c, async () => {
      const moved = trade.moved ?? (await rebuildMoved(c, trade, taker));
      if (!moved) return { ok: false as const, text: 'This trade is too old to reverse automatically. Use Give / Remove by hand.' };
      // The offerer's give went to the taker; the taker's get went to the offerer.
      const blockedBy = (await stillWithReceiver(c, taker, moved.give)) ?? (await stillWithReceiver(c, trade.from, moved.get));
      if (blockedBy) return { ok: false as const, text: `Can't reverse: ${blockedBy}` };
      const data = await getCollection(c);
      const groups = (ids: string[]) => {
        const m = new Map<number, string[]>();
        for (const pid of ids) { const p = parseCopyId(pid); if (p) { const e = encodeEntry(p.card, p.variant); m.set(e, [...(m.get(e) ?? []), pid]); } }
        return m;
      };
      const reversal = { who: staff, note: why };
      const moves: { from: string; to: string; entry: number; count: number; ids: string[]; reversal: typeof reversal }[] = [];
      let fromList = data[trade.from] ?? [];
      let takerList = data[taker] ?? [];
      const mismatch = { ok: false as const, text: "Can't reverse: the collections no longer match the trade." };
      for (const [entry, ids] of groups(moved.give)) {
        const rest = removeEntries(takerList, entry, ids.length);
        if (!rest) return mismatch;
        takerList = rest; fromList = [...fromList, ...Array<number>(ids.length).fill(entry)];
        moves.push({ from: taker, to: trade.from, entry, count: ids.length, ids, reversal });
      }
      for (const [entry, ids] of groups(moved.get)) {
        const rest = removeEntries(fromList, entry, ids.length);
        if (!rest) return mismatch;
        fromList = rest; takerList = [...takerList, ...Array<number>(ids.length).fill(entry)];
        moves.push({ from: trade.from, to: taker, entry, count: ids.length, ids, reversal });
      }
      data[trade.from] = fromList;
      data[taker] = takerList;
      await saveCollection(c, data, { moves });
      return { ok: true as const, moved };
    });
    if (!result.ok) return fail(400, result.text);
    trade.moved = result.moved;
    trade.reversedAt = Date.now();
    trade.reversedBy = staff;
    trade.reverseReason = why;
    await persist(open, history);
    queueEvent(trade, 'reversed', 'admin');
    return { ok: true, trade };
  });
}
