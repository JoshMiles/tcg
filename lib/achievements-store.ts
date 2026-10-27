import { kv } from './db';
import { getAllCollectionUsers, getUserCards, getPackCards, getPacksForSeason, listSeasons } from './kv';
import { countVariants, allowedVariants } from './variants';
import { evaluateSeason, sortAchievements, tradingGoals, streamGoals, TRADING, STREAMS, type AchCard, type Achievement, type CustomGoal } from './achievements';
import { applyAchievementText, disabledKinds, getAchievementSettings, getCustomGoals } from './achievement-settings';
import { completedTradeCount } from './trades';
import { applyBuff } from './buffs';
import { recordAudit } from './audit';
import { loadSerialIndex } from './serials';
import { getScoringSettings } from './scoring';
import { getStreakRun } from './stream-streak';

// The server side of achievements: works out every goal across the published seasons and remembers what has been earned
// (KV hash `user:<u>:ach`, id -> the achievement as it was, plus when it was first seen earned) so a goal is never taken back.

export interface EarnedAchievement extends Achievement { earnedAt: number }

const key = (u: string) => `user:${u.toLowerCase()}:ach`;
const EARNED_KEY = 'achievements:earned'; // hash: kind -> how many times it was earned
const RECENT_KEY = 'achievements:recent'; // list, newest first
const RECENT_MAX = 25;

export interface AchievementStats {
  counts: Record<string, number>;
  recent: { username: string; id: string; title: string; earnedAt: number }[];
}

export async function getAchievementStats(): Promise<AchievementStats> {
  const [rawCounts, rawRecent] = await Promise.all([
    kv.hgetall(EARNED_KEY).catch(() => null) as Promise<Record<string, unknown> | null>,
    kv.lrange(RECENT_KEY, 0, RECENT_MAX - 1).catch(() => []) as Promise<unknown[]>,
  ]);
  const counts = Object.fromEntries(Object.entries(rawCounts ?? {}).map(([k, v]) => [k, Number(v) || 0]));
  const recent = (rawRecent ?? []).map(r => (typeof r === 'string' ? JSON.parse(r) : r) as AchievementStats['recent'][number]).filter(r => r && r.username);
  return { counts, recent };
}

/** Rebuilds the per-goal counts from every player's stored earned goals (the recent list is left alone). */
export async function recountAchievements(): Promise<void> {
  const counts: Record<string, number> = {};
  for (const { username } of await getAllCollectionUsers()) {
    const raw = (await kv.hgetall(key(username)).catch(() => null)) as Record<string, unknown> | null;
    for (const id of Object.keys(raw ?? {})) {
      const seasonId = id.split(':')[0];
      if (seasonId === 'special') continue;
      const kind = id.slice(seasonId.length + 1);
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
  }
  await kv.del(EARNED_KEY);
  if (Object.keys(counts).length > 0) await kv.hset(EARNED_KEY, counts);
}

export interface AchievementsView {
  earned: EarnedAchievement[];
  /** Goals not yet earned, closest first (only for seasons that are still running). */
  next: Achievement[];
  /** Every goal that can be earned now (running seasons and trading) plus everything already earned: the "M" in "N of M". */
  total: number;
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
  let settings: Awaited<ReturnType<typeof getAchievementSettings>> = {};
  let custom: CustomGoal[] = [];
  let allSeasons: Awaited<ReturnType<typeof listSeasons>> = [];
  try {
    allSeasons = await listSeasons();
    const seasons = allSeasons.filter(s => s.status !== 'draft');
    const [cutoff, loaded, customGoals, trades, streak] = await Promise.all([
      getScoringSettings().then(s => s.serialBonusCutoff).catch(() => 0),
      getAchievementSettings().catch(() => ({})),
      getCustomGoals(),
      completedTradeCount(u).catch(() => null), // one history read; a failure just skips the trade goals
      getStreakRun(u).catch(() => 0),
    ]);
    settings = loaded;
    custom = customGoals;
    const disabled = disabledKinds(settings);
    if (trades !== null) live.push(...tradingGoals(trades, disabled, custom));
    live.push(...streamGoals(streak, disabled));
    await Promise.all(seasons.map(async season => {
      const [owned, packs] = await Promise.all([getUserCards(season.collectionName, u), getPacksForSeason(season)]);
      if (owned.length === 0) return;
      const cards: AchCard[] = [];
      for (const pack of packs.filter(p => p.status !== 'draft')) {
        for (const c of await getPackCards(pack.id)) {
          cards.push({ number: c.number, stars: c.stars, variants: pack.upgradesEnabled && c.upgradesEnabled !== false ? allowedVariants(pack, c) : ['regular'] });
        }
      }
      // Edition numbers need the season's copies to be numbered; until then there are no serial milestones.
      const idx = await loadSerialIndex(season.collectionName).catch(() => null);
      const held = idx ? idx.held.get(u) ?? new Map<number, number[]>() : undefined;
      live.push(...evaluateSeason({ seasonId: season.id, seasonName: season.name, cards, counts: countVariants(owned), held, bonusCutoff: cutoff }, disabled, custom));
    }));
  } catch { /* keep what we have */ }

  const fresh = live.filter(a => a.earned && !stored[a.id]);
  if (fresh.length > 0) {
    const add = Object.fromEntries(fresh.map(a => [a.id, { ...a, earnedAt: now } satisfies EarnedAchievement]));
    try {
      await kv.hset(key(u), add);
    } catch { /* try again next view */ }
    Object.assign(stored, add);
    // Stats: count each goal once, whichever of two concurrent syncs wins the claim.
    for (const a of fresh) {
      try {
        if (!(await kv.set(`${key(u)}:counted:${a.id}`, 1, { nx: true }))) continue;
        await kv.hincrby(EARNED_KEY, a.id.slice(a.seasonId.length + 1), 1);
        await kv.lpush(RECENT_KEY, { username: u, id: a.id, title: a.title, earnedAt: now });
        await kv.ltrim(RECENT_KEY, 0, RECENT_MAX - 1);
      } catch { /* stats are best effort */ }
    }
  }

  // Pay each earned goal's bonus once. The marker is the record of payment, so goals stored before buffs existed (27.5) pay out
  // on the first sync too, and two page views that both reach a goal cannot both pay it (set-if-absent).
  try {
    for (const a of live.filter(g => g.earned)) {
      const kind = a.id.slice(a.seasonId.length + 1);
      const buffId = settings[kind]?.buffId ?? custom.find(c => `custom-${c.id}` === kind)?.buffId;
      if (!buffId) continue;
      if (!(await kv.set(`${key(u)}:paid:${a.id}`, 1, { nx: true }))) continue;
      const res = await applyBuff(u, buffId, {
        source: `achievement:${a.id}`,
        // Trade goals have no season: a buff that lasts "for the season" uses the active one.
        seasonId: a.seasonId === TRADING || a.seasonId === STREAMS ? allSeasons.find(s => s.active && !s.endedAt)?.id : a.seasonId,
        now,
        disallowCommunity: true,
      }).catch((e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : 'error' }));
      if (!res.ok) await recordAudit(u, 'Achievement buff not applied', `${a.id}: ${res.reason}`).catch(() => {});
    }
  } catch { /* best effort */ }

  // Tester achievements (pseudo-season `special`, written by lib/access.ts) are kept as they are and listed first.
  const sorted = sortAchievements(Object.values(stored).map(a => ({ ...a, earned: true })));
  const earned = [...sorted.filter(a => a.seasonId === 'special'), ...sorted.filter(a => a.seasonId !== 'special')];
  const earnedIds = new Set(earned.map(a => a.id));
  const activeSeasons = new Set([TRADING, STREAMS, ...allSeasons.filter(s => s.active && !s.endedAt).map(s => s.id)]);
  const next = sortAchievements(live.filter(a => !earnedIds.has(a.id) && activeSeasons.has(a.seasonId) && a.have > 0));
  // Custom words are applied on the way out, so clearing an override brings the stored built-in sentence back.
  const show = <T extends Achievement>(a: T) => applyAchievementText(a, settings);
  const total = new Set([...earnedIds, ...live.filter(a => activeSeasons.has(a.seasonId)).map(a => a.id)]).size;
  return { earned: earned.map(show), next: next.map(show), total };
}
