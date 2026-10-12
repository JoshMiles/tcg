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
  /** Floor and ceiling for the scarcity multiplier (a version with few copies out there is worth up to the max). */
  scarcityMin: number;
  scarcityMax: number;
  /** Counts added to both sides of the scarcity ratio; higher = values move less while counts are small (early season). */
  scarcitySmoothing: number;
  /** An upgraded copy is guaranteed to be worth at least this many times the copies it consumes (before scarcity moves). */
  upgradeMargin: number;
  /** Completion bonus at 100% of the set, as a percent of the set value (what one Regular of every card is worth). */
  completionBonusPct: number;
  /** Extra bonus for owning at least one of every card, as a percent of the set value. */
  completeSetBonusPct: number;
  /** How many collectors the leaderboard lists. */
  leaderboardSize: number;
}

export const DEFAULT_SCORING: ScoringSettings = {
  baseScore: 10,
  rarityExponent: 1,
  scarcityMin: 0.5,
  scarcityMax: 2,
  scarcitySmoothing: 1,
  upgradeMargin: 1.2,
  completionBonusPct: 25,
  completeSetBonusPct: 50,
  leaderboardSize: 100,
};

/** Allowed range for each setting (also used for the form inputs). */
export const SCORING_LIMITS: Record<keyof ScoringSettings, { min: number; max: number; step: number }> = {
  baseScore: { min: 1, max: 1000, step: 1 },
  rarityExponent: { min: 0, max: 3, step: 0.1 },
  scarcityMin: { min: 0.1, max: 1, step: 0.05 },
  scarcityMax: { min: 1, max: 10, step: 0.1 },
  scarcitySmoothing: { min: 0.1, max: 50, step: 0.1 },
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
  // The floor can't be above 1 or the ceiling below 1, or "average" scarcity would stop meaning 1x.
  out.scarcityMin = Math.min(out.scarcityMin, 1);
  out.scarcityMax = Math.max(out.scarcityMax, 1);
  return out;
}
