import { kv } from './db';
import { getCollection, getPackCards, getPacksForSeason, listSeasons } from './kv';
import { countVariants, allowedVariants } from './variants';
import { evaluateSeason, sortAchievements, type AchCard, type Achievement } from './achievements';
import { loadSerialIndex } from './serials';
import { getScoringSettings } from './scoring';

// The server side of achievements: works out every goal across the published seasons and remembers what has been earned
// (KV hash `user:<u>:ach`, id -> the achievement as it was, plus when it was first seen earned) so a goal is never taken back.

export interface EarnedAchievement extends Achievement { earnedAt: number }

const key = (u: string) => `user:${u.toLowerCase()}:ach`;

export interface AchievementsView {
  earned: EarnedAchievement[];
  /** Goals not yet earned, closest first (only for seasons that are still running). */
  next: Achievement[];
}

/** Computes (and stores anything newly earned for) one viewer. Best effort: a failure returns what is already stored. */
export async function syncAchievements(username: string, now = Date.now()): Promise<AchievementsView> {
  const u = username.toLowerCase();
  let stored: Record<string, EarnedAchievement> = {};
  try {
    const raw = (await kv.hgetall(key(u))) as Record<string, unknown> | null;
    for (const [id, v] of Object.entries(raw ?? {})) {
      const parsed = typeof v === 'string' ? JSON.parse(v) : v;
      if (parsed && typeof parsed === 'object') stored[id] = parsed as EarnedAchievement;
    }
  } catch { stored = {}; }

  const live: Achievement[] = [];
  try {
    const seasons = (await listSeasons()).filter(s => s.status !== 'draft');
    const cutoff = (await getScoringSettings().catch(() => null))?.serialBonusCutoff ?? 0;
    await Promise.all(seasons.map(async season => {
      const [collection, packs] = await Promise.all([getCollection(season.collectionName), getPacksForSeason(season)]);
      const owned = collection[u];
      if (!owned || owned.length === 0) return;
      const cards: AchCard[] = [];
      for (const pack of packs.filter(p => p.status !== 'draft')) {
        for (const c of await getPackCards(pack.id)) {
          cards.push({ number: c.number, stars: c.stars, variants: pack.upgradesEnabled && c.upgradesEnabled !== false ? allowedVariants(pack, c) : ['regular'] });
        }
      }
      // Edition numbers need the season's copies to be numbered; until then there are no serial milestones.
      const idx = await loadSerialIndex(season.collectionName).catch(() => null);
      const held = idx ? idx.held.get(u) ?? new Map<number, number[]>() : undefined;
      live.push(...evaluateSeason({ seasonId: season.id, seasonName: season.name, cards, counts: countVariants(owned), held, bonusCutoff: cutoff }));
    }));
  } catch { /* keep what we have */ }

  const fresh = live.filter(a => a.earned && !stored[a.id]);
  if (fresh.length > 0) {
    const add = Object.fromEntries(fresh.map(a => [a.id, { ...a, earnedAt: now } satisfies EarnedAchievement]));
    try { await kv.hset(key(u), add); } catch { /* try again next view */ }
    Object.assign(stored, add);
  }

  // Tester achievements (pseudo-season `special`, written by lib/access.ts) are kept as they are and listed first.
  const sorted = sortAchievements(Object.values(stored).map(a => ({ ...a, earned: true })));
  const earned = [...sorted.filter(a => a.seasonId === 'special'), ...sorted.filter(a => a.seasonId !== 'special')];
  const earnedIds = new Set(earned.map(a => a.id));
  const activeSeasons = new Set((await listSeasons().catch(() => [])).filter(s => s.active && !s.endedAt).map(s => s.id));
  const next = sortAchievements(live.filter(a => !earnedIds.has(a.id) && activeSeasons.has(a.seasonId) && a.have > 0));
  return { earned, next };
}
