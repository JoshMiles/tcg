import { kv, inSandbox } from './db';
import { postDigest } from './discord';
import { getActiveSeasonWithPacks } from './kv';
import { getSeasonLeaderboard } from './leaderboard';
import { getPotw, loadFeatured } from './print-of-week-store';
import { isoWeekKey } from './print-of-week';
import { tradeHistory } from './trades';
import { VARIANT_LABELS } from './variants';
import { watcherCounts } from './watch-index';
import { buildWeeklyDigest, digestWorthPosting, snapshotRanks, type DigestPrint, type RankSnapshot, type WeeklyDigest } from './weekly-digest';

// The weekly digest, server side. KV: `digest:latest` (the last digest that was posted, for the dashboard widget),
// `digest:ranks:<seasonId>` (rank + points per collector, saved by every run, next week's movers compare with it) and
// `digest:week:<yyyy-Www>` (the once-a-week lock). Sandboxes get their own copies of these keys like everything else (lib/db.ts).

export const DIGEST_KEY = 'digest:latest';
const ranksKey = (seasonId: string) => `digest:ranks:${seasonId}`;
const WEEK_TTL_S = 21 * 24 * 3600;
const HISTORY_CAP = 400; // what lib/trades.ts keeps in `trades:history`

export async function getLatestDigest(): Promise<WeeklyDigest | null> {
  try { return (await kv.get<WeeklyDigest>(DIGEST_KEY)) ?? null; } catch { return null; }
}

/** Collects everything the pure builder needs for the active season. Null when no season is active. */
async function build(now: number): Promise<{ digest: WeeklyDigest; snapshot: RankSnapshot; seasonId: string } | null> {
  const active = await getActiveSeasonWithPacks();
  if (!active) return null;
  const { season, packs } = active;
  const cardNames: Record<number, string> = {};
  for (const p of packs) for (const c of p.cards) cardNames[c.number] = c.name;

  const [{ rows }, hours, prev, history, watchers, featured, pick] = await Promise.all([
    getSeasonLeaderboard(season),
    kv.hgetall<Record<string, number | string>>(`stats:h:${season.collectionName}`).catch(() => null),
    kv.get<RankSnapshot>(ranksKey(season.id)).catch(() => null),
    tradeHistory().catch(() => []),
    watcherCounts(Object.keys(cardNames).map(Number)),
    loadFeatured().catch(() => null),
    getPotw(),
  ]);

  // The pick counts only when this run (or an admin) chose it recently, and it is still a live print of this season.
  let print: DigestPrint | null = null;
  if (featured && pick && featured.season.id === season.id && now - pick.chosenAt < 8 * 86_400_000) {
    const v = featured.copy.variant;
    print = {
      name: featured.card.name, label: v === 'regular' ? '' : VARIANT_LABELS[v],
      uid: featured.copy.uid ?? null, href: featured.copy.uid ? `/c/${featured.copy.uid}` : `/copy/${encodeURIComponent(season.id)}/${featured.copy.id}`,
      reason: pick.reason,
    };
  }

  const board = rows.map(r => ({ username: r.username, score: r.score }));
  const digest = buildWeeklyDigest({
    now, weekKey: isoWeekKey(now), seasonId: season.id, seasonName: season.name, hours: hours ?? {}, board,
    prevRanks: prev && typeof prev === 'object' ? prev : null, trades: history, historyCap: HISTORY_CAP, watchers, cardNames, print,
  });
  return { digest, snapshot: snapshotRanks(board), seasonId: season.id };
}

export type DigestOutcome =
  | { status: 'posted'; week: string; channels: number; pulls: number; trades: number }
  | { status: 'skipped'; week: string; reason: string }
  | { status: 'already'; week: string }
  | { status: 'error'; error: string };

/** The weekly cron's step: builds and posts the digest once per ISO week (a second call in the same week does nothing). */
export async function digestOncePerWeek(now = Date.now()): Promise<DigestOutcome> {
  if (await inSandbox()) return { status: 'skipped', week: isoWeekKey(now), reason: 'Never runs inside a sandbox.' };
  const week = isoWeekKey(now);
  const lock = `digest:week:${week}`;
  if (!(await kv.set(lock, now, { nx: true, ex: WEEK_TTL_S }))) return { status: 'already', week };
  try {
    const built = await build(now);
    if (!built) return { status: 'skipped', week, reason: 'No season is active.' };
    // Every run keeps the ranks, even a quiet week, so the next digest has something to compare with.
    await kv.set(ranksKey(built.seasonId), built.snapshot);
    if (!digestWorthPosting(built.digest)) return { status: 'skipped', week, reason: 'No pulls and no trades this week.' };
    await kv.set(DIGEST_KEY, built.digest);
    const channels = await postDigest(built.digest);
    return { status: 'posted', week, channels, pulls: built.digest.pulls, trades: built.digest.trades };
  } catch (e) {
    await kv.del(lock).catch(() => {}); // let a retry later in the week try again
    return { status: 'error', error: e instanceof Error ? e.message : 'Digest failed.' };
  }
}
