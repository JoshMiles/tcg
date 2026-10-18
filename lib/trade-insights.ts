import type { Trade, TradeItem } from './trade-core';

// Client-safe analysis of the trade history for the admin Trades page: summary numbers, a daily series, who trades most, which cards
// move most, and the "worth a look" flags. Everything here is computed from the trades it is given (open + the kept history, newest
// first, capped at 400), so it describes recent activity, not all time.

const DAY = 86_400_000;
const copies = (items: TradeItem[]) => items.reduce((n, i) => n + i.count, 0);

export interface TradeStats {
  openCount: number;
  escrowCards: number;
  ended: number;
  accepted: number;
  declined: number;
  cancelled: number;
  expired: number;
  countered: number;
  failed: number;
  /** accepted / (accepted + declined + cancelled + expired + failed), or null with nothing to go on. */
  acceptRate: number | null;
  /** Median minutes from offer to acceptance, or null. */
  medianAcceptMin: number | null;
  perDay: { day: string; offered: number; accepted: number }[];
  topTraders: { username: string; trades: number; cards: number }[];
  topCards: { key: string; copies: number }[];
  /** The number of ended trades the numbers are based on, and when the oldest began. */
  since: number | null;
}

/** The counterparty who completed a trade: the recipient of a direct offer, or whoever took a listing. */
export const partnerOf = (t: Trade): string | undefined => t.to ?? (t.status === 'accepted' ? t.resolvedBy : undefined);

export function computeTradeStats(open: Trade[], history: Trade[], now: number, days = 14): TradeStats {
  const counts = { accepted: 0, declined: 0, cancelled: 0, expired: 0, countered: 0, failed: 0 };
  for (const t of history) if (t.status in counts) counts[t.status as keyof typeof counts]++;
  const decided = counts.accepted + counts.declined + counts.cancelled + counts.expired + counts.failed;

  const waits = history.filter(t => t.status === 'accepted' && t.resolvedAt).map(t => (t.resolvedAt! - t.createdAt) / 60_000).sort((a, b) => a - b);
  const medianAcceptMin = waits.length ? Math.round(waits[Math.floor(waits.length / 2)]) : null;

  const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const perDayMap = new Map<string, { offered: number; accepted: number }>();
  for (let i = days - 1; i >= 0; i--) perDayMap.set(dayKey(now - i * DAY), { offered: 0, accepted: 0 });
  for (const t of [...open, ...history]) { const e = perDayMap.get(dayKey(t.createdAt)); if (e) e.offered++; }
  for (const t of history) if (t.status === 'accepted' && t.resolvedAt) { const e = perDayMap.get(dayKey(t.resolvedAt)); if (e) e.accepted++; }

  const traders = new Map<string, { trades: number; cards: number }>();
  const cardCopies = new Map<string, number>();
  for (const t of history) {
    if (t.status !== 'accepted') continue;
    const moved = copies(t.give) + copies(t.get);
    for (const u of [t.from, partnerOf(t)]) {
      if (!u) continue;
      const e = traders.get(u) ?? { trades: 0, cards: 0 };
      e.trades++; e.cards += moved;
      traders.set(u, e);
    }
    for (const i of [...t.give, ...t.get]) { const k = `${t.seasonId}:${i.cardNumber}`; cardCopies.set(k, (cardCopies.get(k) ?? 0) + i.count); }
  }

  return {
    openCount: open.length,
    escrowCards: open.filter(t => t.escrowed).reduce((n, t) => n + copies(t.give), 0),
    ended: history.length,
    ...counts,
    acceptRate: decided > 0 ? counts.accepted / decided : null,
    medianAcceptMin,
    perDay: [...perDayMap].map(([day, v]) => ({ day, ...v })),
    topTraders: [...traders].map(([username, v]) => ({ username, ...v })).sort((a, b) => b.trades - a.trades || b.cards - a.cards).slice(0, 8),
    topCards: [...cardCopies].map(([key, c]) => ({ key, copies: c })).sort((a, b) => b.copies - a.copies).slice(0, 8),
    since: history.length ? Math.min(...history.map(t => t.createdAt)) : null,
  };
}

// ── flags ──

export type FlagKind = 'lopsided' | 'repeat' | 'burst' | 'newbie';
export interface TradeFlag { kind: FlagKind; label: string }

export const FLAG_RULES = {
  /** One side is worth at least this many times the other... */
  lopsidedRatio: 2,
  /** ...and the gap is at least this many points. */
  lopsidedGap: 50,
  /** This many completed trades between the same two viewers within `repeatDays`. */
  repeatTrades: 3,
  repeatDays: 7,
  /** This many offers from one viewer within `burstMinutes`. */
  burstOffers: 5,
  burstMinutes: 10,
  /** A viewer whose profile is younger than this when the offer was made. */
  newAccountHours: 24,
} as const;

export interface FlagContext {
  /** Points of one side of a trade at today's values. */
  points: (t: Trade, side: 'give' | 'get') => number;
  /** When the viewer's profile was created (ms), if known. */
  createdAt: (username: string) => number | undefined;
}

/** Flags per trade id. Only trades with something worth a look appear in the map. */
export function flagTrades(trades: Trade[], ctx: FlagContext): Map<string, TradeFlag[]> {
  const out = new Map<string, TradeFlag[]>();
  const add = (id: string, f: TradeFlag) => { const l = out.get(id) ?? []; if (!l.some(x => x.kind === f.kind)) l.push(f); out.set(id, l); };

  for (const t of trades) {
    if (t.status === 'cancelled' || t.status === 'expired' || t.status === 'countered') continue; // nothing changed hands
    const g = ctx.points(t, 'give'), w = ctx.points(t, 'get');
    const hi = Math.max(g, w), lo = Math.min(g, w);
    if (hi - lo >= FLAG_RULES.lopsidedGap && hi >= FLAG_RULES.lopsidedRatio * Math.max(lo, 1)) {
      add(t.id, { kind: 'lopsided', label: `${Math.round(g)} pts for ${Math.round(w)} pts` });
    }
  }

  // Completed trades between the same pair.
  const pairs = new Map<string, Trade[]>();
  for (const t of trades) {
    const b = partnerOf(t);
    if (t.status !== 'accepted' || !b) continue;
    const k = [t.from, b].sort().join('|');
    pairs.set(k, [...(pairs.get(k) ?? []), t]);
  }
  for (const [k, list] of pairs) {
    const sorted = [...list].sort((a, b) => (a.resolvedAt ?? 0) - (b.resolvedAt ?? 0));
    for (let i = 0; i < sorted.length; i++) {
      const window = sorted.filter(t => Math.abs((t.resolvedAt ?? 0) - (sorted[i].resolvedAt ?? 0)) <= FLAG_RULES.repeatDays * DAY);
      if (window.length >= FLAG_RULES.repeatTrades) for (const t of window) add(t.id, { kind: 'repeat', label: `${window.length} trades between ${k.split('|').join(' and ')} in ${FLAG_RULES.repeatDays} days` });
    }
  }

  // Rapid-fire offers.
  const byOfferer = new Map<string, Trade[]>();
  for (const t of trades) byOfferer.set(t.from, [...(byOfferer.get(t.from) ?? []), t]);
  for (const [user, list] of byOfferer) {
    const sorted = [...list].sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 0; i < sorted.length; i++) {
      const window = sorted.filter(t => t.createdAt >= sorted[i].createdAt && t.createdAt - sorted[i].createdAt <= FLAG_RULES.burstMinutes * 60_000);
      if (window.length >= FLAG_RULES.burstOffers) for (const t of window) add(t.id, { kind: 'burst', label: `${user} made ${window.length} offers within ${FLAG_RULES.burstMinutes} minutes` });
    }
  }

  // New accounts.
  for (const t of trades) {
    for (const u of [t.from, t.to].filter((x): x is string => !!x)) {
      const c = ctx.createdAt(u);
      if (c && t.createdAt - c < FLAG_RULES.newAccountHours * 3_600_000) add(t.id, { kind: 'newbie', label: `${u} had only just joined` });
    }
  }
  return out;
}

export const FLAG_LABEL: Record<FlagKind, string> = { lopsided: 'Lopsided', repeat: 'Repeat pair', burst: 'Rapid offers', newbie: 'New account' };

/** One row of the trade log, as plain data for the client component. */
export interface TradeRow {
  id: string;
  status: string;
  open: boolean;
  kind: 'direct' | 'listing';
  from: string;
  to?: string;
  takenBy?: string;
  seasonId: string;
  seasonName: string;
  giveText: string;
  getText: string;
  givePts: number;
  getPts: number;
  cardNames: string;
  note?: string;
  reason?: string;
  resolvedBy?: string;
  /** Which staff member cancelled it, when an admin or mod did. */
  staff?: string;
  counterOf?: string;
  createdAt: number;
  resolvedAt?: number;
  expiresAt: number;
  /** Staff reversed this completed trade (the prints went back). */
  reversedAt?: number;
  reversedBy?: string;
  reverseReason?: string;
  flags: TradeFlag[];
}

export function tradesToCsv(rows: TradeRow[]): string {
  const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['id', 'status', 'kind', 'from', 'to_or_taker', 'season', 'gives', 'wants', 'give_points', 'get_points', 'created', 'resolved', 'resolved_by', 'reason', 'flags'];
  const lines = rows.map(r => [r.id, r.status, r.kind, r.from, r.to ?? r.takenBy ?? '', r.seasonName, r.giveText, r.getText, Math.round(r.givePts), Math.round(r.getPts), new Date(r.createdAt).toISOString(), r.resolvedAt ? new Date(r.resolvedAt).toISOString() : '', r.resolvedBy ?? '', r.reason ?? '', r.flags.map(f => f.kind).join(' ')].map(esc).join(','));
  return [head.join(','), ...lines].join('\n');
}
