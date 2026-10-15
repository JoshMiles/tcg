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

// ── recent pulls (the home feed) ──

export interface PullItem {
  seq: number;
  username: string;
  cardNumber: number;
  cardName: string;
  stars: number;
  variant?: 'regular' | 'reverse' | 'full' | 'shiny';
  at: number;
  thumb?: string;
  hex?: string;
  /** How the card arrived: pulled in a pack (default) or granted (an admin gift or the grant webhook). */
  kind?: 'pull' | 'grant';
  /** A pull worth a second look: Shiny, Full Art or a 5-star card. */
  notable: boolean;
  /** The serial number the copy got, and its points multiplier when above 1. */
  serial?: number;
  bonus?: number;
}

/** Why a pull stands out (the chip text), or null for an ordinary one. */
export function notableReason(p: { variant?: string; stars: number; serial?: number }): string | null {
  if (p.serial === 1) return 'First ever';
  if (p.variant === 'shiny') return 'Shiny';
  if (p.variant === 'full') return 'Full Art';
  if (p.stars >= 5) return '5★';
  return null;
}

/** "just now", "3m ago", "2h ago", "4d ago". */
export function agoShort(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
