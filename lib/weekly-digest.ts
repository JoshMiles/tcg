// The weekly digest: a pure summary of the last seven days for the community Discord channel. Client-safe (no server imports) so the
// admin dashboard widget and the Discord embed share one shape. Loading the inputs, posting and storing it is in
// lib/weekly-digest-store.ts. Hidden and private collectors never reach `board` (the leaderboard already leaves them out), so they
// can be neither in the top 3 nor in the movers.

export const WEEK_MS = 7 * 24 * 3_600_000;

export interface DigestBoardRow { username: string; score: number }
/** The snapshot kept between runs: rank (1 is best) and points per collector. */
export type RankSnapshot = Record<string, [number, number]>;
export interface DigestTrade { status: string; createdAt: number; resolvedAt?: number; give: { cardNumber: number; count: number }[]; get: { cardNumber: number; count: number }[] }
export interface DigestPrint { name: string; label: string; uid: number | null; href: string; reason: string }

export interface DigestInput {
  now: number;
  weekKey: string;
  seasonId: string;
  seasonName: string;
  /** The season collection's `stats:h:` hash: field "<UTC yyyymmddhh>|<metric>". */
  hours: Record<string, number | string>;
  /** Ranked best first, hidden and private collectors already removed. */
  board: DigestBoardRow[];
  prevRanks: RankSnapshot | null;
  /** Resolved trades, newest first, as `trades:history` keeps them (capped at `historyCap`). */
  trades: DigestTrade[];
  historyCap: number;
  /** Watcher count per card number (only cards with at least one). */
  watchers: Record<number, number>;
  cardNames: Record<number, string>;
  print: DigestPrint | null;
}

export interface DigestMover { username: string; rank: number; climbed: number; gained: number }

export interface WeeklyDigest {
  weekKey: string;
  from: number;
  to: number;
  seasonId: string;
  seasonName: string;
  pulls: number;
  newCollectors: number;
  upgrades: number;
  trades: number;
  top: { username: string; rank: number; points: number }[];
  /** Null on the first run (no snapshot to compare with). */
  movers: DigestMover[] | null;
  mostTraded: { cardNumber: number; name: string; count: number }[];
  /** The trade history no longer reaches back a whole week, so the counts are a floor. */
  tradedAtLeast: boolean;
  mostWanted: { cardNumber: number; name: string; watchers: number } | null;
  print: DigestPrint | null;
}

/** UTC hour key "yyyymmddhh" to ms. */
function hourMs(h: string): number {
  return Date.UTC(+h.slice(0, 4), +h.slice(4, 6) - 1, +h.slice(6, 8), +h.slice(8, 10));
}

export function buildWeeklyDigest(i: DigestInput): WeeklyDigest {
  const from = i.now - WEEK_MS;
  const sums: Record<string, number> = {};
  for (const [field, value] of Object.entries(i.hours)) {
    const bar = field.indexOf('|');
    if (bar !== 10) continue;
    const t = hourMs(field.slice(0, bar));
    if (!(t >= from && t <= i.now)) continue;
    const metric = field.slice(bar + 1);
    sums[metric] = (sums[metric] ?? 0) + (Number(value) || 0);
  }

  const top = i.board.slice(0, 3).map((r, n) => ({ username: r.username, rank: n + 1, points: r.score }));

  let movers: DigestMover[] | null = null;
  if (i.prevRanks) {
    const prev = i.prevRanks;
    movers = i.board
      .map((r, n) => {
        const was = prev[r.username];
        return was ? { username: r.username, rank: n + 1, climbed: was[0] - (n + 1), gained: r.score - was[1] } : null;
      })
      .filter((m): m is DigestMover => !!m && (m.climbed > 0 || m.gained > 0))
      .sort((a, b) => b.climbed - a.climbed || b.gained - a.gained || a.username.localeCompare(b.username))
      .slice(0, 3);
  }

  const counts = new Map<number, number>();
  for (const t of i.trades) {
    if (t.status !== 'accepted' || (t.resolvedAt ?? 0) < from) continue;
    for (const it of [...t.give, ...t.get]) counts.set(it.cardNumber, (counts.get(it.cardNumber) ?? 0) + (it.count || 1));
  }
  const mostTraded = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3)
    .map(([cardNumber, count]) => ({ cardNumber, name: i.cardNames[cardNumber] ?? `Card #${cardNumber}`, count }));
  const oldest = i.trades.reduce((m, t) => Math.min(m, t.resolvedAt ?? t.createdAt), Infinity);
  const tradedAtLeast = i.trades.length >= i.historyCap && oldest > from;

  let mostWanted: WeeklyDigest['mostWanted'] = null;
  for (const [k, n] of Object.entries(i.watchers)) {
    const cardNumber = Number(k);
    if (n > 0 && (!mostWanted || n > mostWanted.watchers || (n === mostWanted.watchers && cardNumber < mostWanted.cardNumber))) {
      mostWanted = { cardNumber, name: i.cardNames[cardNumber] ?? `Card #${cardNumber}`, watchers: n };
    }
  }

  return {
    weekKey: i.weekKey, from, to: i.now, seasonId: i.seasonId, seasonName: i.seasonName,
    pulls: sums.pull ?? 0, newCollectors: sums.newViewer ?? 0, upgrades: sums.upgrade ?? 0, trades: sums.trade ?? 0,
    top, movers, mostTraded, tradedAtLeast, mostWanted, print: i.print,
  };
}

/** A week with no pulls and no trades (the off-season) gets no digest. */
export const digestWorthPosting = (d: WeeklyDigest) => d.pulls > 0 || d.trades > 0;

/** The snapshot to keep for next week's movers. */
export function snapshotRanks(board: DigestBoardRow[], cap = 1000): RankSnapshot {
  const out: RankSnapshot = {};
  board.slice(0, cap).forEach((r, n) => { out[r.username] = [n + 1, r.score]; });
  return out;
}

/** Made-up numbers for the Discord channel card's test button. */
export function sampleDigest(now = Date.now()): WeeklyDigest {
  return {
    weekKey: 'sample', from: now - WEEK_MS, to: now, seasonId: 'sample', seasonName: 'Season 1',
    pulls: 312, newCollectors: 6, upgrades: 9, trades: 14,
    top: [{ username: 'sample_one', rank: 1, points: 4210 }, { username: 'sample_two', rank: 2, points: 3980 }, { username: 'sample_three', rank: 3, points: 3500 }],
    movers: [{ username: 'sample_four', rank: 5, climbed: 4, gained: 620 }, { username: 'sample_two', rank: 2, climbed: 1, gained: 410 }],
    mostTraded: [{ cardNumber: 1, name: 'Sample Card', count: 5 }, { cardNumber: 2, name: 'Other Sample', count: 3 }],
    tradedAtLeast: false,
    mostWanted: { cardNumber: 3, name: 'Wanted Sample', watchers: 7 },
    print: { name: 'Sample Card', label: 'Shiny', uid: 1023381, href: '/c/1023381', reason: 'Held by 5 collectors, traded 4 times' },
  };
}
