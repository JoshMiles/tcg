import { kv } from './db';
import { getCollection, getPacksForSeason, getPackCards, getSeason, listSeasons, readSeasons, saveSeason, setActiveSeason, withLock } from './kv';
import { getSeasonLeaderboard, type LeaderboardRow } from './leaderboard';
import { uniqueCount } from './collection';
import { decodeEntry } from './variants';
import type { Card, Season } from './types';
import { seasonPreflight, type PreflightItem } from './season-preflight';
import type { IconName } from '@/app/components/Icon';

// Season lifecycle on the server: live stats for a season, the wrap-up snapshot (final standings + awards), ending / reopening a
// season, activating one (which wraps up the one it replaces), and the lazy scheduler for start / end dates (no background job:
// kv.getActiveSeason() runs applySeasonSchedule() the first time anything asks after a date has passed).

export interface SeasonStats {
  viewers: number;
  copies: number;
  pool: number;
  found: number;
  complete: number;
  avgCompletion: number;
  top: { username: string; unique: number } | null;
  /** Days between the season's start (its start date, else creation) and its end (or now). */
  days: number;
}

/** Cards in the season's published packs. */
async function seasonCards(season: Season): Promise<Card[]> {
  const packs = (await getPacksForSeason(season)).filter(p => p.status === 'published');
  return (await Promise.all(packs.map(p => getPackCards(p.id)))).flat();
}

export async function getSeasonStats(season: Season): Promise<SeasonStats> {
  const [collection, cards] = await Promise.all([getCollection(season.collectionName), seasonCards(season)]);
  const users = Object.entries(collection);
  const pool = cards.length;
  const foundSet = new Set<number>();
  let copies = 0;
  let complete = 0;
  let top: SeasonStats['top'] = null;
  let uniqueSum = 0;
  for (const [username, entries] of users) {
    copies += entries.length;
    for (const e of entries) foundSet.add(decodeEntry(e).cardNumber);
    const u = uniqueCount(entries);
    uniqueSum += u;
    if (pool > 0 && u >= pool) complete++;
    if (!top || u > top.unique) top = { username, unique: u };
  }
  const start = season.startsAt ?? season.createdAt;
  const end = season.endedAt ?? Date.now();
  return {
    viewers: users.length, copies, pool, found: foundSet.size, complete,
    avgCompletion: users.length > 0 && pool > 0 ? Math.round((uniqueSum / users.length / pool) * 100) : 0,
    top,
    days: Math.max(1, Math.ceil((end - start) / 86_400_000)),
  };
}

// ── Wrap-up snapshot ──

export interface Award { id: string; title: string; icon: IconName; username: string; detail: string }
export interface SnapshotRow {
  username: string; score: number; cardPoints: number; uniqueCards: number; copies: number; complete: boolean;
  /** The split of the bonuses and the copies per version, kept so the final board can show the same breakdown as the live one. Snapshots taken before these existed lack them. */
  completionBonus?: number; setBonus?: number; variants?: { regular: number; reverse: number; full: number; shiny: number };
}
export interface SeasonSnapshot {
  at: number;
  seasonName: string;
  stats: Pick<SeasonStats, 'viewers' | 'copies' | 'pool' | 'found' | 'complete'>;
  standings: SnapshotRow[];
  awards: Award[];
}

const snapKey = (id: string) => `season:${id}:wrap`;
const STANDINGS_CAP = 100;

/** Awards from the final standings: podium places, completionists and the biggest collectors. Pure, so it is testable. */
export function buildAwards(rows: LeaderboardRow[]): Award[] {
  const out: Award[] = [];
  const podium: [string, string, IconName][] = [['champion', 'Champion', 'trophy'], ['runner-up', 'Runner-up', 'medal'], ['third', 'Third place', 'medal']];
  rows.slice(0, 3).forEach((r, i) => out.push({ id: podium[i][0], title: podium[i][1], icon: podium[i][2], username: r.username, detail: `${r.score.toLocaleString()} points` }));
  for (const r of rows.filter(x => x.complete).slice(0, 10)) out.push({ id: 'completionist', title: 'Completionist', icon: 'cheese', username: r.username, detail: 'Owned every card' });
  const best = <T,>(pick: (r: LeaderboardRow) => number, min = 1): LeaderboardRow | null => {
    let top: LeaderboardRow | null = null;
    for (const r of rows) if (pick(r) >= min && (!top || pick(r) > pick(top))) top = r;
    return top;
  };
  const mostCards = best(r => r.uniqueCards);
  if (mostCards) out.push({ id: 'most-cards', title: 'Biggest collection', icon: 'cards', username: mostCards.username, detail: `${mostCards.uniqueCards} cards collected` });
  const mostPulls = best(r => r.copies);
  if (mostPulls) out.push({ id: 'most-pulls', title: 'Most pulls', icon: 'zap', username: mostPulls.username, detail: `${mostPulls.copies.toLocaleString()} pulls` });
  const shiny = best(r => r.variants.shiny);
  if (shiny) out.push({ id: 'shiny-hunter', title: 'Full Art Holo hunter', icon: 'sparkles', username: shiny.username, detail: `${shiny.variants.shiny} FH` });
  const full = best(r => r.variants.full);
  if (full) out.push({ id: 'full-art', title: 'Full Art collector', icon: 'gem', username: full.username, detail: `${full.variants.full} Full Art` });
  return out;
}

export async function getSnapshot(seasonId: string): Promise<SeasonSnapshot | null> {
  try { return (await kv.get<SeasonSnapshot>(snapKey(seasonId))) ?? null; } catch { return null; }
}

/** Computes and stores the final standings and awards for a season (replacing an earlier snapshot). */
export async function takeSnapshot(season: Season): Promise<SeasonSnapshot> {
  const [board, stats] = await Promise.all([getSeasonLeaderboard(season), getSeasonStats(season)]);
  const snapshot: SeasonSnapshot = {
    at: Date.now(),
    seasonName: season.name,
    stats: { viewers: stats.viewers, copies: stats.copies, pool: stats.pool, found: stats.found, complete: stats.complete },
    standings: board.rows.slice(0, STANDINGS_CAP).map(r => ({ username: r.username, score: r.score, cardPoints: r.cardPoints, uniqueCards: r.uniqueCards, copies: r.copies, complete: r.complete, completionBonus: r.completionBonus, setBonus: r.setBonus, variants: r.variants })),
    awards: buildAwards(board.rows),
  };
  await kv.set(snapKey(season.id), snapshot);
  return snapshot;
}

// ── Lifecycle ──

const LOCK = 'season-lifecycle';

/** Ends a season: takes the snapshot, deactivates it, marks it ended and (by default) freezes trading for it. */
export async function endSeason(id: string, opts: { freezeTrading?: boolean } = {}): Promise<{ ok: true; snapshot: SeasonSnapshot } | { ok: false; error: string }> {
  return withLock(LOCK, async () => {
    const season = await getSeason(id);
    if (!season || season.status !== 'published') return { ok: false as const, error: 'Only a published season can be ended.' };
    const snapshot = await takeSnapshot(season);
    await saveSeason({ ...season, active: false, endedAt: Date.now(), tradingFrozen: opts.freezeTrading === false ? season.tradingFrozen : true, autoStart: undefined });
    return { ok: true as const, snapshot };
  });
}

/** Undo an end: clears the ended mark and the trading freeze. It does not activate the season. */
export async function reopenSeason(id: string): Promise<void> {
  await withLock(LOCK, async () => {
    const season = await getSeason(id);
    if (!season) return;
    await saveSeason({ ...season, endedAt: undefined, tradingFrozen: undefined });
  });
}

/** Makes a season the active one. The season it replaces is wrapped up first (snapshot + ended + trading frozen). */
export async function activateWithWrapUp(id: string): Promise<{ ok: true; replaced?: string } | { ok: false; error: string }> {
  return withLock(LOCK, async () => {
    const target = await getSeason(id);
    if (!target) return { ok: false as const, error: 'That season no longer exists.' };
    if (target.status === 'draft') return { ok: false as const, error: 'Publish the season first.' };
    const seasons = await readSeasons();
    const outgoing = seasons.find(s => s.active && s.id !== id && !s.endedAt);
    if (outgoing) {
      const snapshot = await takeSnapshot(outgoing);
      void snapshot;
      await saveSeason({ ...outgoing, active: false, endedAt: Date.now(), tradingFrozen: true, autoStart: undefined });
    }
    // Starting (or restarting) a season clears any ended mark and freeze on it.
    await saveSeason({ ...target, endedAt: undefined, tradingFrozen: undefined, autoStart: undefined });
    await setActiveSeason(id);
    return { ok: true as const, replaced: outgoing?.name };
  });
}

/** Applies due start / end dates. Safe to call often: it does nothing unless a date has passed. */
export async function applySeasonSchedule(): Promise<void> {
  const now = Date.now();
  const due = (list: Season[]) => ({
    starts: list.filter(s => s.status === 'published' && !s.active && s.autoStart && !s.endedAt && s.startsAt !== undefined && s.startsAt <= now && (s.endsAt === undefined || s.endsAt > now)).sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0)),
    ends: list.filter(s => s.status === 'published' && s.active && !s.endedAt && s.endsAt !== undefined && s.endsAt <= now),
  });
  const first = due(await readSeasons());
  if (first.starts.length === 0 && first.ends.length === 0) return;
  // Work from a fresh read so two requests racing here don't both act.
  const { starts, ends } = due(await readSeasons());
  const next = starts[starts.length - 1]; // the latest start that is due wins
  if (next) await activateWithWrapUp(next.id);
  for (const s of ends) if (s.id !== next?.id) await endSeason(s.id, { freezeTrading: true });
}

/** Awards a viewer has earned across seasons (newest season first). */
export async function getUserAwards(username: string): Promise<{ seasonId: string; seasonName: string; award: Award }[]> {
  const name = username.toLowerCase();
  const seasons = [...await listSeasons()].sort((a, b) => b.createdAt - a.createdAt);
  const snaps = await Promise.all(seasons.map(async s => ({ s, snap: await getSnapshot(s.id) })));
  return snaps.flatMap(({ s, snap }) => (snap?.awards ?? []).filter(a => a.username.toLowerCase() === name).map(award => ({ seasonId: s.id, seasonName: s.name, award })));
}

export interface PastSeasonResult { seasonId: string; seasonName: string; rank: number; score: number }

/** Pure: one row per ended season whose snapshot standings include the viewer (rank = place in the final standings), newest ended first. */
export function pastSeasonResults(username: string, seasons: Season[], snaps: (SeasonSnapshot | null)[]): PastSeasonResult[] {
  const name = username.toLowerCase();
  const rows: (PastSeasonResult & { endedAt: number })[] = [];
  seasons.forEach((s, i) => {
    const at = snaps[i]?.standings.findIndex(r => r.username.toLowerCase() === name) ?? -1;
    if (s.endedAt && at >= 0) rows.push({ seasonId: s.id, seasonName: s.name, rank: at + 1, score: snaps[i]!.standings[at].score, endedAt: s.endedAt });
  });
  return rows.sort((a, b) => b.endedAt - a.endedAt).map(({ endedAt: _, ...r }) => r);
}

/** The viewer's rank and score in each ended season, read from the wrap-up snapshots (the same reads as getUserAwards). */
export async function getPastSeasonResults(username: string): Promise<PastSeasonResult[]> {
  const seasons = (await listSeasons()).filter(s => s.endedAt);
  return pastSeasonResults(username, seasons, await Promise.all(seasons.map(s => getSnapshot(s.id))));
}

export interface ActivationPreview {
  /** The season that will be wrapped up when this one goes live. */
  outgoing: { id: string; name: string; viewers: number; copies: number } | null;
  /** Things worth knowing before switching. */
  warnings: PreflightItem[];
}

/** What activating a season will do, and what might be wrong with it, for the confirmation dialog. */
export async function getActivationPreview(season: Season): Promise<ActivationPreview> {
  const [seasons, packs] = await Promise.all([listSeasons(), getPacksForSeason(season)]);
  const cards = new Map(await Promise.all(packs.filter(p => p.status === 'published' && p.active).map(async p => [p.id, await getPackCards(p.id)] as const)));
  const warnings = seasonPreflight(season, packs, id => cards.get(id) ?? []);
  const out = seasons.find(s => s.active && s.id !== season.id && !s.endedAt);
  let outgoing: ActivationPreview['outgoing'] = null;
  if (out) {
    const stats = await getSeasonStats(out);
    outgoing = { id: out.id, name: out.name, viewers: stats.viewers, copies: stats.copies };
  }
  return { outgoing, warnings };
}
