// Score samples for the My Stats history chart (pure). A sample is stored when the viewer opens My Stats, at most every 30 minutes
// and only if something changed (or it has been 6 hours), so the history reads as "from when you started looking".

export interface ScoreSample { at: number; score: number; rank: number | null }

export const SAMPLE_GAP_MS = 30 * 60_000;
export const SAMPLE_REFRESH_MS = 6 * 3_600_000;
export const HISTORY_CAP = 120;

export function shouldSample(last: ScoreSample | undefined, next: { score: number; rank: number | null }, now: number): boolean {
  if (!last) return true;
  const age = now - last.at;
  if (age < SAMPLE_GAP_MS) return false;
  return last.score !== next.score || last.rank !== next.rank || age >= SAMPLE_REFRESH_MS;
}

/** Oldest first, one point per sample. */
export function chartPoints(samples: ScoreSample[]): ScoreSample[] {
  return [...samples].sort((a, b) => a.at - b.at);
}
