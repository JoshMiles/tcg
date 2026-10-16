// Everything the admin and mod Trades pages show: open offers and the kept history as table rows (with card names, points and
// flags), plus the summary stats. Shared so the mod panel's Trades page and the admin's read the same data.
import { getUserProfile, listSeasons } from './kv';
import { getTradeSettings, listOpenTrades, sweepTrades, tradeHistory } from './trades';
import { describeItems, type Trade } from './trade-core';
import { getTradeCards, getTradePools } from './trade-view';
import { stackPoints, type TradeCardInfo, type TradePools } from './trade-view-core';
import { computeTradeStats, flagTrades, partnerOf, type TradeRow } from './trade-insights';

export async function loadTradeAdminData() {
  await sweepTrades();
  const [settings, open, history, seasons] = await Promise.all([getTradeSettings(), listOpenTrades(), tradeHistory(), listSeasons()]);
  const all: Trade[] = [...open, ...history];
  const now = Date.now();

  // Card names / points for every season that has a trade, and when each involved viewer first appeared.
  const cardsBySeason: Record<string, Record<number, TradeCardInfo>> = {};
  const poolsBySeason: Record<string, TradePools> = {};
  for (const s of seasons) if (all.some(t => t.seasonId === s.id)) {
    cardsBySeason[s.id] = await getTradeCards(s).catch(() => ({}));
    poolsBySeason[s.id] = await getTradePools(s, open).catch(() => ({ viewer: null, give: {}, mine: {} }));
  }
  const users = [...new Set(all.flatMap(t => [t.from, partnerOf(t)].filter((u): u is string => !!u)))];
  const created = new Map<string, number>();
  await Promise.all(users.map(async u => { const c = (await getUserProfile(u).catch(() => null))?.createdAt; if (c) created.set(u, c); }));

  const pts = (t: Trade, side: 'give' | 'get') => stackPoints(side === 'give' ? t.give : t.get, cardsBySeason[t.seasonId] ?? {}, side === 'give' ? poolsBySeason[t.seasonId]?.give[t.id] : undefined);
  const flags = flagTrades(all, { points: pts, createdAt: u => created.get(u) });
  const stats = computeTradeStats(open, history, now);

  const seasonName = (id: string) => seasons.find(s => s.id === id)?.name ?? id;
  const row = (t: Trade, isOpen: boolean): TradeRow => {
    const cards = cardsBySeason[t.seasonId] ?? {};
    const nameOf = (n: number) => cards[n]?.name;
    return {
      id: t.id, status: t.status, open: isOpen, kind: t.kind, from: t.from, to: t.to,
      takenBy: t.kind === 'listing' && t.status === 'accepted' ? t.resolvedBy : undefined,
      seasonId: t.seasonId, seasonName: seasonName(t.seasonId),
      giveText: describeItems(t.give, nameOf), getText: describeItems(t.get, nameOf),
      givePts: pts(t, 'give'), getPts: pts(t, 'get'),
      cardNames: [...t.give, ...t.get].map(i => nameOf(i.cardNumber) ?? `#${i.cardNumber}`).join(' '),
      note: t.note, reason: t.reason, resolvedBy: t.resolvedBy, staff: t.staff, counterOf: t.counterOf,
      createdAt: t.createdAt, resolvedAt: t.resolvedAt, expiresAt: t.expiresAt,
      reversedAt: t.reversedAt, reversedBy: t.reversedBy, reverseReason: t.reverseReason,
      flags: flags.get(t.id) ?? [],
    };
  };
  const rows = [...open.map(t => row(t, true)), ...history.map(t => row(t, false))];
  const flaggedOpen = rows.filter(r => r.open && r.flags.length > 0).length;
  const flaggedRecent = rows.filter(r => !r.open && r.flags.length > 0 && now - (r.resolvedAt ?? r.createdAt) < 7 * 86_400_000).length;
  return { settings, open, history, seasons, rows, stats, cardsBySeason, flaggedOpen, flaggedRecent, now };
}
