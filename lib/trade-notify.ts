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
import { getTradeCards } from './trade-view';
import type { Notice, NoticeKind, Swap, SwapCard } from './trade-notice-core';

// Notifications and activity records for trade events. Everything here is best-effort: a failure must never undo or block
// a trade, so every entry point swallows errors. (Called after the trade lock is released: see flushEvents in lib/trades.ts.)

const NOTICE_CAP = 30;
const noticesKey = (u: string) => `notif:${u}`;
const seenKey = (u: string) => `notif:${u}:seen`;

export type TradeAction = 'offered' | 'countered' | 'accepted' | 'declined' | 'cancelled' | 'expired';

export async function notify(username: string, notice: Omit<Notice, 'id' | 'at'>): Promise<void> {
  try {
    const user = username.toLowerCase();
    if (!wantsNotice(await getUserSettings(user), notice.kind)) return; // the viewer switched this kind of notice off
    const full: Notice = { ...notice, id: Math.random().toString(36).slice(2, 10), at: Date.now() };
    await kv.lpush(noticesKey(user), full);
    await kv.ltrim(noticesKey(user), 0, NOTICE_CAP - 1);
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

export async function markNoticesSeen(username: string): Promise<void> {
  try { await kv.set(seenKey(username.toLowerCase()), Date.now()); } catch { /* best effort */ }
}

/** "2× Cheesy Cat (Shiny Full Art)" for each stack. */
export function stackLines(items: TradeItem[], cards: Record<number, TradeCardInfo>): string[] {
  return items.map(i => `${i.count}× ${cards[i.cardNumber]?.name ?? `#${i.cardNumber}`}${i.variant === 'regular' ? '' : ` (${VARIANT_LABELS[i.variant]})`}`);
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
export async function announceTrade(trade: Trade, action: TradeAction, by?: string): Promise<void> {
  try {
    const season = await getSeason(trade.seasonId);
    const cards = season ? await getTradeCards(season) : {};
    const give = stackLines(trade.give, cards);
    const get = stackLines(trade.get, cards);
    const sentence = `${give.join(', ')} for ${get.join(', ')}`;
    const partner = action === 'accepted' ? by : trade.to;

    await recordActivity({
      type: 'trade', action: trade.counterOf && action === 'offered' ? 'countered' : action, username: trade.from, partner, by, kind: trade.kind, give, get,
      givePts: stackPoints(trade.give, cards), getPts: stackPoints(trade.get, cards), note: trade.note,
      cardNumber: trade.give[0]?.cardNumber, collectionName: season?.collectionName,
    });

    const tell = (user: string | undefined, kind: NoticeKind, text: string, swap?: Swap) =>
      user ? notify(user, { kind, text, tradeId: trade.id, ...(swap ? { swap } : {}) }) : Promise.resolve();
    const adminCancel = action === 'cancelled' && by === 'admin';
    switch (action) {
      case 'offered':
        if (trade.counterOf) await tell(trade.to, 'countered', `@${trade.from} countered your offer: they give ${sentence}.`);
        else if (trade.kind === 'direct') await tell(trade.to, 'offer', `@${trade.from} offered you a trade: they give ${sentence}.`);
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
      case 'expired':
        await tell(trade.from, 'expired', 'Your offer ran out of time. Your cards are back in your collection.');
        await tell(trade.to, 'expired', `The offer from @${trade.from} expired.`);
        break;
      default: break;
    }
  } catch { /* best effort */ }
}
