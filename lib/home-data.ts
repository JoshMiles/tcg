// Small pure helpers for the home page (client-safe, no database): where a viewer stands, and how long a season has left.

export interface StandingRow { username: string; score: number; uniqueCards: number }

export interface Standing {
  rank: number;
  of: number;
  score: number;
  uniqueCards: number;
  totalCards: number;
  pct: number;
  /** The collector one place above and the points needed to pass them (null at #1). */
  ahead: { username: string; gap: number } | null;
}

/** The viewer's place on a board (rows are sorted best first). Null when they are not on it (no cards yet, or a private profile). */
export function viewerStanding(rows: StandingRow[], username: string, totalCards: number): Standing | null {
  const i = rows.findIndex(r => r.username === username);
  if (i < 0) return null;
  const me = rows[i];
  const above = i > 0 ? rows[i - 1] : null;
  return {
    rank: i + 1,
    of: rows.length,
    score: Math.round(me.score),
    uniqueCards: me.uniqueCards,
    totalCards,
    pct: totalCards > 0 ? Math.round((me.uniqueCards / totalCards) * 100) : 0,
    ahead: above ? { username: above.username, gap: Math.max(1, Math.ceil(above.score - me.score)) } : null,
  };
}

/** "Ends in 3 days" / "Ends in 5 hours" / "Ended", or null when the season has no end date. */
export function seasonCountdown(endsAt: number | undefined, now = Date.now()): string | null {
  if (!endsAt) return null;
  const ms = endsAt - now;
  if (ms <= 0) return 'Ended';
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 24) return `Ends in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.ceil(hours / 24);
  return `Ends in ${days} day${days === 1 ? '' : 's'}`;
}
