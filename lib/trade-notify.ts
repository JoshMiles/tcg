import { kv } from './db';
import { getUserSettings } from './user-settings-store';
import { wantsNotice } from './user-settings';
import { getSeason } from './kv';
import { recordActivity } from './activity';
import { getSeasonOverview } from './site-data';
import { getHoloResolver } from './holo';
import { VARIANT_LABELS } from './variants';
import type { Trade, TradeItem } from './trade-core';
import { stackPoints, type TradeCardInfo } from './trade-view-core';
import { parseCopyId, type SerialPool } from './serials-core';
import { getTradeCards } from './trade-view';
import type { Notice, NoticeKind, Swap, SwapCard } from './trade-notice-core';
import { watchersOf, wantedForTrades } from './watch-index';
import { matchingAlerts } from './watch-core';
import { notifyListing } from './discord';
import { encodeEntry } from './variants';
import { pushNotice } from './push';

// Notifications and activity records for trade events. Everything here is best-effort: a failure must never undo or block
// a trade, so every entry point swallows errors. (Called after the trade lock is released: see flushEvents in lib/trades.ts.)

const NOTICE_CAP = 30;
const noticesKey = (u: string) => `notif:${u}`;
const seenKey = (u: string) => `notif:${u}:seen`;
const versionKey = (u: string) => `notif:${u}:v`;

/**
 * The serial numbers of the copies on each side, read BEFORE they moved (afterwards they have changed hands), so the points quoted in
 * the activity feed and Discord include the serial bonuses. A side that cannot be known (what a listing asks of a stranger) is absent.
 */
export interface EventPools { give?: SerialPool; get?: SerialPool }

export type TradeAction = 'offered' | 'countered' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'reversed';

export async function notify(username: string, notice: Omit<Notice, 'id' | 'at'>): Promise<void> {
  try {
    const user = username.toLowerCase();
    if (!wantsNotice(await getUserSettings(user), notice.kind)) return; // the viewer switched this kind of notice off
    const full: Notice = { ...notice, id: Math.random().toString(36).slice(2, 10), at: Date.now() };
    await kv.lpush(noticesKey(user), full);
    await kv.ltrim(noticesKey(user), 0, NOTICE_CAP - 1);
    await kv.incr(versionKey(user)); // the bell asks "has anything changed since version N?"
    await pushNotice(user, full); // and, if they turned alerts on, their phone or browser hears about it too
  } catch { /* best effort */ }
}

/** Newest first, plus when the viewer last opened the bell (anything newer is unread). */
export async function listNotices(username: string): Promise<{ notices: Notice[]; seen: number }> {
  const user = username.toLowerCase();
  const [notices, seen] = await Promise.all([
    kv.lrange<Notice>(noticesKey(user), 0, NOTICE_CAP - 1).catch(() => [] as Notice[]),
    kv.get<number>(seenKey(user)).catch(() => 0),
  ]);
  return { notices: notices ?? [], seen: Number(seen) || 0 };
}

/** Bumped by every new notice and every mark-as-read, so a bell polling with its last version gets a cheap 204 when nothing changed. */
export async function getNoticeVersion(username: string): Promise<number> {
  return Number(await kv.get<number>(versionKey(username.toLowerCase())).catch(() => 0)) || 0;
}

export async function markNoticesSeen(username: string): Promise<void> {
  try {
    const user = username.toLowerCase();
    await kv.set(seenKey(user), Date.now());
    await kv.incr(versionKey(user));
  } catch { /* best effort */ }
}

/** "2× Cheesy Cat (Shiny Full Art)" for each stack. */
export function stackLines(items: TradeItem[], cards: Record<number, TradeCardInfo>): string[] {
  return items.map(i => `${i.count}× ${cards[i.cardNumber]?.name ?? `#${i.cardNumber}`}${i.variant === 'regular' ? '' : ` (${VARIANT_LABELS[i.variant]})`}`);
}

/** The stack lines with the edition numbers of the copies that move ("... · #7, #3"): the newest copies leave first, like on the trade page. */
function withEditions(items: TradeItem[], lines: string[], pool?: SerialPool): string[] {
  return lines.map((line, i) => {
    const picked = items[i].ids?.map(id => parseCopyId(id)?.n ?? 0).filter(n => n > 0).sort((a, b) => b - a);
    const serials = picked?.length ? picked : [...(pool?.[encodeEntry(items[i].cardNumber, items[i].variant)] ?? [])].slice(-items[i].count).reverse();
    return serials.length ? `${line} · ${serials.slice(0, 4).map(n => `#${n}`).join(', ')}${serials.length > 4 ? ` +${serials.length - 4}` : ''}` : line;
  });
}

/** The cards of a swap with art and holo, for the trade animation. */
export async function buildSwap(seasonId: string, gave: TradeItem[], got: TradeItem[], withUser: string): Promise<Swap | undefined> {
  try {
    const season = await getSeason(seasonId);
    if (!season) return undefined;
    const [overview, holoFor] = await Promise.all([getSeasonOverview(season), getHoloResolver()]);
    const byNumber = new Map(overview.cards.map(c => [c.number, c]));
    const toCards = (items: TradeItem[]): SwapCard[] => items.flatMap(i => {
      const c = byNumber.get(i.cardNumber);
      return c ? [{ number: c.number, name: c.name, imageUrl: c.imageUrl, fullArtImageUrl: c.fullArtImageUrl, variant: i.variant, count: i.count, holo: holoFor(c.pack, c.stars) }] : [];
    });
    return { with: withUser, gave: toCards(gave), got: toCards(got) };
  } catch {
    return undefined;
  }
}

/**
 * Records what happened to an offer: the admin activity feed / Discord (with the cards and points on both sides) and the
 * notification of whoever needs to know. `by` is who did it ('admin' for an admin cancel).
 */
export async function announceTrade(trade: Trade, action: TradeAction, by?: string, pools: EventPools = {}): Promise<void> {
  try {
    const season = await getSeason(trade.seasonId);
    const cards = season ? await getTradeCards(season) : {};
    const give = stackLines(trade.give, cards);
    const get = stackLines(trade.get, cards);
    const sentence = `${give.join(', ')} for ${get.join(', ')}`;
    const partner = action === 'accepted' ? by : action === 'reversed' ? trade.resolvedBy : trade.to;

    await recordActivity({
      type: 'trade', action: trade.counterOf && action === 'offered' ? 'countered' : action, username: trade.from, partner, by, kind: trade.kind, give, get,
      givePts: stackPoints(trade.give, cards, pools.give), getPts: stackPoints(trade.get, cards, pools.get), note: trade.note,
      cardNumber: trade.give[0]?.cardNumber, collectionName: season?.collectionName,
    });

    const tell = (user: string | undefined, kind: NoticeKind, text: string, swap?: Swap) =>
      user ? notify(user, { kind, text, tradeId: trade.id, ...(swap ? { swap } : {}) }) : Promise.resolve();
    const adminCancel = action === 'cancelled' && by === 'admin';
    switch (action) {
      case 'offered':
        if (trade.counterOf) await tell(trade.to, 'countered', `@${trade.from} countered your offer: they give ${sentence}.`);
        else if (trade.kind === 'direct') await tell(trade.to, 'offer', `@${trade.from} offered you a trade: they give ${sentence}.`);
        else {
          await notifyWatchers(trade, cards);
          const counts = (await wantedForTrades([trade]))[trade.id] ?? {};
          const wanted = trade.give.filter(i => counts[i.cardNumber]).map(i => {
            const n = counts[i.cardNumber];
            const v = i.variant === 'regular' ? '' : ` (${VARIANT_LABELS[i.variant]})`;
            return `${n} ${n === 1 ? 'collector is' : 'collectors are'} looking for ${cards[i.cardNumber]?.name ?? `#${i.cardNumber}`}${v}`;
          });
          await notifyListing({
            id: trade.id, from: trade.from, expiresAt: trade.expiresAt, give: withEditions(trade.give, give, pools.give), get, givePts: stackPoints(trade.give, cards, pools.give),
            getPts: stackPoints(trade.get, cards, pools.get), imageUrl: cards[trade.give[0]?.cardNumber]?.imageUrl, note: trade.note, wanted,
          });
        }
        break;
      case 'accepted': {
        const swap = await buildSwap(trade.seasonId, trade.give, trade.get, by ?? '');
        await tell(trade.from, 'accepted', `@${by} accepted your trade: you gave ${give.join(', ')} and got ${get.join(', ')}.`, swap);
        break;
      }
      case 'declined':
        await tell(trade.from, 'declined', `@${trade.to} declined your offer. Your cards are back in your collection.`);
        break;
      case 'cancelled':
        if (adminCancel) {
          await tell(trade.from, 'admin', 'An admin cancelled your offer. Your cards are back in your collection.');
          await tell(trade.to, 'cancelled', `The offer from @${trade.from} was cancelled.`);
        } else await tell(trade.to, 'cancelled', `@${trade.from} withdrew their offer to you.`);
        break;
      case 'reversed': {
        const text = (other: string) => `A trade between you and @${other} was reversed by staff: ${trade.reverseReason ?? 'no reason given'}. The prints went back to where they started.`;
        await tell(trade.from, 'admin', text(trade.resolvedBy ?? '?'));
        await tell(trade.resolvedBy, 'admin', text(trade.from));
        break;
      }
      case 'expired':
        await tell(trade.from, 'expired', 'Your offer ran out of time. Your cards are back in your collection.');
        await tell(trade.to, 'expired', `The offer from @${trade.from} expired.`);
        break;
      default: break;
    }
  } catch { /* best effort */ }
}

const WATCHERS_CAP = 200;

/**
 * A new board listing: tell every viewer whose Looking for list or saved alerts include one of the cards it gives (never the lister).
 * Each hears about it once, in the bell. Best-effort like the rest of this file.
 */
export async function notifyWatchers(trade: Trade, cards: Record<number, TradeCardInfo>): Promise<void> {
  try {
    const candidates = (await watchersOf(trade.give.map(i => i.cardNumber))).filter(u => u !== trade.from).slice(0, WATCHERS_CAP);
    const asking = stackLines(trade.get, cards).join(', ');
    for (const u of candidates) {
      const hits = matchingAlerts(await getUserSettings(u), trade.give);
      if (hits.length === 0) continue;
      const what = stackLines(trade.give.filter(i => hits.some(h => h.cardNumber === i.cardNumber && h.variant === i.variant)), cards).join(', ');
      await notify(u, { kind: 'watch', text: `@${trade.from} listed ${what} on the board, which you are watching for. They want ${asking}.`, tradeId: trade.id });
    }
  } catch { /* best effort */ }
}
