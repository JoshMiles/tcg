'use server';
import { requireAdmin } from '@/lib/admin-guard';
import { getActiveSeason, getCollection, getPackCards, getPacksForSeason } from '@/lib/kv';
import { getScoringSettings } from '@/lib/scoring';
import { previewScoring, type ScoringPreview } from '@/lib/scoring-preview';
import { getHiddenUsers } from '@/lib/user-admin';

/**
 * What the scoring numbers currently typed in the form would do to the active season, next to what is saved. Read-only:
 * nothing is stored. Values are clamped exactly as saving would clamp them.
 */
export async function previewScoringAction(raw: Record<string, string>): Promise<{ ok: true; season: string; preview: ScoringPreview } | { ok: false; message: string }> {
  await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return { ok: false, message: 'There is no active season to preview against.' };
  // The same packs and viewers the real leaderboard uses (getSeasonLeaderboard), so the "saved" side matches what viewers see.
  const [saved, collection, hidden, packList] = await Promise.all([getScoringSettings(), getCollection(season.collectionName), getHiddenUsers().catch(() => new Set<string>()), getPacksForSeason(season)]);
  const packs = await Promise.all(packList.map(async pack => ({ pack, cards: await getPackCards(pack.id) })));
  return { ok: true, season: season.name, preview: previewScoring(packs, collection, saved, raw, hidden) };
}
