// The scoring settings' shape, defaults, limits and sanitising: pure and client-safe (no database). The stored copy lives in ./scoring.

/**
 * Everything that tunes how cards are valued and how the leaderboard is scored. Edited in Admin → Settings → Scoring and
 * stored in one KV key. The defaults reproduce the original hard-coded behaviour exactly, so an untouched install scores
 * the same as before. Settings apply to every season's leaderboard immediately (values are always computed live).
 */
export interface ScoringSettings {
  /** Points one Regular copy of an average card (equal pull chance to every other card) is worth. */
  baseScore: number;
  /** How strongly rarity counts: value scales with rarity^exponent. 1 = proportional, <1 flattens, >1 exaggerates. */
  rarityExponent: number;
  /** Serial bonus: copy #1 of a card (in its version) is worth this many times a normal copy; the bonus shrinks steadily with the serial. */
  serialBonusMax: number;
  /** How many serials get a bonus. #1 gets the full bonus, the bonus fades to nothing after this serial. 0 switches it off. */
  serialBonusCutoff: number;
  /** An upgraded copy is guaranteed to be worth at least this many times the copies it consumes. */
  upgradeMargin: number;
  /** Progress bonus at 100% of the set, as a percent of the set value (what one Regular of every card is worth). */
  completionBonusPct: number;
  /** Extra bonus for owning at least one of every card, as a percent of the set value. */
  completeSetBonusPct: number;
  /** How many collectors the leaderboard lists. */
  leaderboardSize: number;
}

export const DEFAULT_SCORING: ScoringSettings = {
  baseScore: 10,
  rarityExponent: 1,
  serialBonusMax: 3,
  serialBonusCutoff: 20,
  upgradeMargin: 1.2,
  completionBonusPct: 25,
  completeSetBonusPct: 50,
  leaderboardSize: 100,
};

/** Allowed range for each setting (also used for the form inputs). */
export const SCORING_LIMITS: Record<keyof ScoringSettings, { min: number; max: number; step: number }> = {
  baseScore: { min: 1, max: 1000, step: 1 },
  rarityExponent: { min: 0, max: 3, step: 0.1 },
  serialBonusMax: { min: 1, max: 20, step: 0.1 },
  serialBonusCutoff: { min: 0, max: 1000, step: 1 },
  upgradeMargin: { min: 1, max: 5, step: 0.05 },
  completionBonusPct: { min: 0, max: 500, step: 1 },
  completeSetBonusPct: { min: 0, max: 1000, step: 1 },
  leaderboardSize: { min: 5, max: 500, step: 5 },
};

/** Turns anything (stored data, a form submission) into valid settings: numbers only, clamped to range, defaults for the rest. */
export function sanitizeScoring(raw: unknown): ScoringSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_SCORING };
  for (const key of Object.keys(DEFAULT_SCORING) as (keyof ScoringSettings)[]) {
    const v = typeof r[key] === 'string' && (r[key] as string).trim() !== '' ? Number(r[key]) : r[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const { min, max } = SCORING_LIMITS[key];
      out[key] = Math.min(max, Math.max(min, v));
    }
  }
  out.leaderboardSize = Math.round(out.leaderboardSize);
  out.serialBonusCutoff = Math.round(out.serialBonusCutoff);
  return out;
}

/**
 * What a copy's serial does to its points: the first copy ever made of a card (in its version) gets `serialBonusMax`×, the
 * bonus fades in a straight line and is gone after serial `serialBonusCutoff`. No serial (or one past the cutoff) = 1×.
 */
export function serialMultiplier(n: number | undefined, s: Pick<ScoringSettings, 'serialBonusMax' | 'serialBonusCutoff'>): number {
  if (n === undefined || !(n >= 1) || n > s.serialBonusCutoff) return 1;
  return 1 + (s.serialBonusMax - 1) * (1 - (n - 1) / s.serialBonusCutoff);
}
