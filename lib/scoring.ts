import { kv } from './db';
import { DEFAULT_SCORING, sanitizeScoring, type ScoringSettings } from './scoring-core';

// Re-exported so existing imports keep working; client components import from './scoring-core' instead (this file talks to the database).
export { DEFAULT_SCORING, SCORING_LIMITS, sanitizeScoring } from './scoring-core';
export type { ScoringSettings } from './scoring-core';

const KEY = 'scoring:settings';

export async function getScoringSettings(): Promise<ScoringSettings> {
  try {
    return sanitizeScoring(await kv.get(KEY));
  } catch {
    return { ...DEFAULT_SCORING }; // KV hiccup: score with the defaults rather than failing the page
  }
}

export async function saveScoringSettings(settings: ScoringSettings): Promise<void> {
  await kv.set(KEY, sanitizeScoring(settings));
}

export async function resetScoringSettings(): Promise<void> {
  await kv.del(KEY);
}
