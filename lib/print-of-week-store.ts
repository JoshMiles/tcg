import { kv } from './db';
import { getActiveSeason, getCollection, getPackCards, getPacksForSeason, getSeason } from './kv';
import { getCopy, getOwnerCopies, isTracking } from './serials';
import type { Copy } from './serials-core';
import { isoWeekKey, pickPrintOfWeek, pushHistory, recentUids, scorePrint, type Candidate, type PotwHistoryEntry, type PotwPick } from './print-of-week';
import type { Card, Pack, Season } from './types';

// Print of the week, server side. KV: `potw:current` (the pick), `potw:history` (newest 20 {uid, at}), `potw:week:<yyyy-Www>` (the
// once-a-week lock). Sandboxes get their own copies of these keys like everything else (lib/db.ts).

const CURRENT = 'potw:current';
const HISTORY = 'potw:history';
const WEEK_TTL_S = 21 * 24 * 3600;
const BATCH = 10;

export async function getPotw(): Promise<PotwPick | null> {
  try { return (await kv.get<PotwPick>(CURRENT)) ?? null; } catch { return null; }
}

async function getHistory(): Promise<PotwHistoryEntry[]> {
  try { return (await kv.get<PotwHistoryEntry[]>(HISTORY)) ?? []; } catch { return []; }
}

export interface ScanResult { candidates: Candidate[]; owners: number; prints: number; ms: number }
export type ScanSummary = Omit<ScanResult, 'candidates'> & { candidates: number };

/** Scores every live print of a season (everyone in the collection blob; a print in a trade offer is skipped by `scorePrint`). */
export async function scanSeason(season: Season, now = Date.now()): Promise<ScanResult> {
  const started = Date.now();
  const c = season.collectionName;
  if (!(await isTracking(c))) return { candidates: [], owners: 0, prints: 0, ms: 0 };
  const owners = Object.keys(await getCollection(c));
  const candidates: Candidate[] = [];
  let prints = 0;
  for (let i = 0; i < owners.length; i += BATCH) {
    const lists = await Promise.all(owners.slice(i, i + BATCH).map(o => getOwnerCopies(c, o).catch(() => [] as Copy[])));
    for (const copy of lists.flat()) {
      prints++;
      const s = scorePrint(copy, now);
      if (s && copy.uid) candidates.push({ ...s, uid: copy.uid, copyId: copy.id, at: copy.at });
    }
  }
  return { candidates, owners: owners.length, prints, ms: Date.now() - started };
}

async function store(pick: PotwPick, now: number): Promise<void> {
  await kv.set(CURRENT, pick);
  await kv.set(HISTORY, pushHistory(await getHistory(), pick.uid, now));
}

export type PickOutcome = { ok: true; pick: PotwPick; scan: ScanSummary } | { ok: false; reason: string };

/** Scans the active season and stores the best print that was not picked in the last 8 weeks. `by` is 'auto' or a staff login. */
export async function pickNow(by: string, now = Date.now()): Promise<PickOutcome> {
  const season = await getActiveSeason();
  if (!season) return { ok: false, reason: 'No season is active.' };
  if (!(await isTracking(season.collectionName))) return { ok: false, reason: 'The active season has no numbered prints yet.' };
  const scan = await scanSeason(season, now);
  const best = pickPrintOfWeek(scan.candidates, recentUids(await getHistory(), now));
  if (!best) return { ok: false, reason: 'No print is eligible right now.' };
  const pick: PotwPick = { uid: best.uid, seasonId: season.id, copyId: best.copyId, score: best.score, reason: best.reason, chosenAt: now, by };
  await store(pick, now);
  return { ok: true, pick, scan: { ...scan, candidates: scan.candidates.length } };
}

export type WeeklyOutcome =
  | { status: 'picked'; pick: PotwPick; scan: ScanSummary }
  | { status: 'already'; week: string }
  | { status: 'none'; reason: string };

/** The weekly cron's step: picks once per ISO week (a second call in the same week does nothing). */
export async function pickOncePerWeek(now = Date.now()): Promise<WeeklyOutcome> {
  const week = isoWeekKey(now);
  const lock = `potw:week:${week}`;
  const got = await kv.set(lock, now, { nx: true, ex: WEEK_TTL_S });
  if (!got) return { status: 'already', week };
  let out: PickOutcome;
  try { out = await pickNow('auto', now); } catch (e) { out = { ok: false, reason: e instanceof Error ? e.message : 'Pick failed.' }; }
  if (!out.ok) {
    // Nothing was picked, so let a retry later in the week try again.
    await kv.del(lock).catch(() => { /* the TTL clears it */ });
    return { status: 'none', reason: out.reason };
  }
  return { status: 'picked', pick: out.pick, scan: out.scan };
}

/** An admin features one specific print. Returns why not, or null when done. */
export async function featureCopy(season: Season, copy: Copy, by: string, now = Date.now()): Promise<string | null> {
  if (!copy.owner) return 'That print no longer exists.';
  if (!copy.uid) return 'It has no print number yet.';
  const s = scorePrint(copy, now);
  if (!s) return 'It is in a trade offer right now.';
  await store({ uid: copy.uid, seasonId: season.id, copyId: copy.id, score: s.score, reason: s.reason, chosenAt: now, by }, now);
  return null;
}

export async function clearPotw(): Promise<void> {
  await kv.del(CURRENT);
}

export interface FeaturedPrint { pick: PotwPick; season: Season; copy: Copy; card: Card; pack: Pack }

/** The pick with everything the home page draws, or null when there is none or it was spent / removed since (never a broken card). */
export async function loadFeatured(): Promise<FeaturedPrint | null> {
  const pick = await getPotw();
  if (!pick) return null;
  const season = await getSeason(pick.seasonId);
  if (!season || season.status === 'draft') return null;
  const copy = await getCopy(season.collectionName, pick.copyId);
  if (!copy || !copy.owner || copy.uid !== pick.uid) return null;
  for (const pack of await getPacksForSeason(season)) {
    const card = (await getPackCards(pack.id)).find(x => x.number === copy.card);
    if (card) return { pick, season, copy, card, pack };
  }
  return null;
}
