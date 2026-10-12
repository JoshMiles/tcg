import { buildLeaderboard, collectionBonuses, computeSeasonValues, type LeaderboardRow } from './leaderboard';
import { sanitizeScoring, type ScoringSettings } from './scoring';
import type { SerialIndex } from './serials-core';
import type { Card, Pack } from './types';

// "What would these scoring numbers do?" Recomputes the active season with the saved settings and with the candidate ones
// side by side, so an admin sees the effect before saving (scoring is global: saving re-scores every season at once).
// Pure: pass in the season's packs and collection.

export interface PreviewSide {
  setValue: number;
  topScore: number;
  maxCardValue: number;
  completionAtFull: number;
  completeSetBonus: number;
  top: { username: string; score: number; rank: number }[];
}

export interface ScoringPreview {
  saved: PreviewSide;
  candidate: PreviewSide;
  candidateSettings: ScoringSettings;
  /** The top viewers with their rank under each, for the movers list. */
  movers: { username: string; savedRank: number; candidateRank: number; savedScore: number; candidateScore: number }[];
  /** How many of the compared viewers change rank. */
  rankChanges: number;
  viewers: number;
}

const COMPARE = 20;

function side(rows: LeaderboardRow[], values: ReturnType<typeof computeSeasonValues>): PreviewSide {
  const bonus = collectionBonuses(values, values.totalCards);
  let max = 0;
  for (const v of values.cards.values()) max = Math.max(max, v.values.regular, v.values.reverse, v.values.full, v.values.shiny);
  return {
    setValue: values.setValue, topScore: rows[0]?.score ?? 0, maxCardValue: max,
    completionAtFull: bonus.completion, completeSetBonus: bonus.set,
    top: rows.slice(0, 5).map((r, i) => ({ username: r.username, score: r.score, rank: i + 1 })),
  };
}

export function previewScoring(
  packs: { pack: Pack; cards: Card[] }[],
  collection: Record<string, number[]>,
  saved: ScoringSettings,
  candidateRaw: unknown,
  hidden: Set<string> = new Set(),
  serials: SerialIndex | null = null,
): ScoringPreview {
  const candidateSettings = sanitizeScoring(candidateRaw);
  const sv = computeSeasonValues(packs, collection, saved, serials);
  const cv = computeSeasonValues(packs, collection, candidateSettings, serials);
  const sRows = buildLeaderboard(sv, collection).filter(r => !hidden.has(r.username));
  const cRows = buildLeaderboard(cv, collection).filter(r => !hidden.has(r.username));
  const cRank = new Map(cRows.map((r, i) => [r.username, { rank: i + 1, score: r.score }]));

  const movers = sRows.slice(0, COMPARE).map((r, i) => ({
    username: r.username, savedRank: i + 1, savedScore: r.score,
    candidateRank: cRank.get(r.username)?.rank ?? i + 1, candidateScore: cRank.get(r.username)?.score ?? r.score,
  }));
  return {
    saved: side(sRows, sv), candidate: side(cRows, cv), candidateSettings, movers,
    rankChanges: movers.filter(m => m.savedRank !== m.candidateRank).length, viewers: sRows.length,
  };
}
