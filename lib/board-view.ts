// Sorting, filtering and rank movement for the public leaderboard (pure, client-safe).

export type BoardMetric = 'points' | 'cards' | 'copies' | 'shiny';

export const METRIC_LABELS: Record<BoardMetric, string> = { points: 'Points', cards: 'Different cards', copies: 'Prints', shiny: 'Shinies' };

export interface BoardRow {
  username: string;
  score: number;
  cardPoints: number;
  completionBonus: number;
  setBonus: number;
  complete: boolean;
  uniqueCards: number;
  copies: number;
  /** Copies per version, Regular first (see VARIANTS). */
  variants: { regular: number; reverse: number; full: number; shiny: number };
  /** The bonuses are one lump (completionBonus holds the total): an old final standing that did not record the split. */
  bonusesTogether?: boolean;
}

/** The saved standings of an ended season as board rows. Collectors who have since been hidden or gone private are left out. */
export function standingsToBoardRows(
  standings: { username: string; score: number; cardPoints: number; uniqueCards: number; copies: number; complete: boolean; completionBonus?: number; setBonus?: number; variants?: BoardRow['variants'] }[],
  hidden: ReadonlySet<string> = new Set(),
): { rows: BoardRow[]; hasVariants: boolean } {
  const kept = standings.filter(s => !hidden.has(s.username));
  return {
    hasVariants: kept.length > 0 && kept.every(s => !!s.variants),
    rows: kept.map(s => {
      const split = s.completionBonus !== undefined && s.setBonus !== undefined;
      return {
        username: s.username, score: s.score, cardPoints: s.cardPoints, complete: s.complete, uniqueCards: s.uniqueCards, copies: s.copies,
        completionBonus: split ? s.completionBonus! : Math.max(0, s.score - s.cardPoints), setBonus: split ? s.setBonus! : 0,
        variants: s.variants ?? { regular: 0, reverse: 0, full: 0, shiny: 0 },
        ...(split ? {} : { bonusesTogether: true }),
      };
    }),
  };
}

export const metricValue = (r: BoardRow, m: BoardMetric): number =>
  m === 'points' ? r.score : m === 'cards' ? r.uniqueCards : m === 'copies' ? r.copies : r.variants.shiny;

export interface RankedRow { row: BoardRow; rank: number }

/** Every row ranked by the chosen metric (ties share a rank, the points score breaks ties in the ordering). */
export function rankBoard(rows: BoardRow[], metric: BoardMetric): RankedRow[] {
  const sorted = [...rows].sort((a, b) => metricValue(b, metric) - metricValue(a, metric) || b.score - a.score || a.username.localeCompare(b.username));
  const out: RankedRow[] = [];
  sorted.forEach((row, i) => {
    const prev = out[i - 1];
    out.push({ row, rank: prev && metricValue(prev.row, metric) === metricValue(row, metric) ? prev.rank : i + 1 });
  });
  return out;
}

/** Narrow a ranked board without changing anyone's rank (so searching for someone still shows their true place). */
export function filterBoard(ranked: RankedRow[], opts: { q?: string; completeOnly?: boolean }): RankedRow[] {
  const q = (opts.q ?? '').trim().toLowerCase().replace(/^@/, '');
  return ranked.filter(r => (!opts.completeOnly || r.row.complete) && (!q || r.row.username.includes(q)));
}

/** Places gained (+) or lost (−) since an earlier set of ranks. New names (not in `before`) get no entry. */
export function rankMovement(before: Record<string, number>, now: RankedRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { row, rank } of now) {
    const was = before[row.username];
    if (was !== undefined && was !== rank) out[row.username] = was - rank;
  }
  return out;
}

export const rankSnapshot = (ranked: RankedRow[]): Record<string, number> => Object.fromEntries(ranked.map(r => [r.row.username, r.rank]));
