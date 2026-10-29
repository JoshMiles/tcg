// Live stats for TCG Bridge's OBS text sources (ROADMAP 57.4). Nothing is stored or counted per pull: everything is read from the activity
// log (the same numbers as the end-of-stream recap, lib/stream-recap.ts) and the pull queue when the app asks (the `stats` action).
// The app asks for the stats it has mapped and only while OBS is connected, so an unmapped stat costs nothing. A test pull is never counted
// (getActivity leaves it out). The log keeps 500 events, so on a very long stream the numbers are a floor.
import { getActivity, type ActivityEvent } from './activity';
import { asPullEvent, type PullEvent } from './activity-view';
import { currentStreamKey } from './mixitup';
import { packGoalText } from './pack-goal';
import { buildStreamRecap } from './stream-recap';
import { queueLength } from './webhooks';

/** The stats the site can answer. The happy hour countdown is not here: the app counts it down from `happyHour.endsAt`. */
export const STAT_KEYS = ['packs', 'lastBig', 'topPuller', 'goal', 'queue'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export interface BridgeStats {
  packs?: number;
  lastBig?: { username: string; cardName: string } | null;
  topPuller?: { username: string; packs: number } | null;
  /** The pack goal's finished text ("Label: 37 / 50"), or null when no goal is set for this stream (ROADMAP 57.5). */
  goal?: string | null;
  queue?: number;
}

/** A "big pull" is this many stars or more (the app's pull feed uses 4 as its default too). */
export const BIG_PULL_STARS = 4;

/** When the stream window started: `s<ms>` is the Twitch stream's start, `d<date>` the UTC day (see streamKey). */
export function streamStart(key: string): number {
  const t = key.startsWith('s') ? Number(key.slice(1)) : Date.parse(`${key.slice(1)}T00:00:00Z`);
  return Number.isFinite(t) ? t : 0;
}

/** Packs, the last big pull and the top puller since `since`, from the activity log (newest first). */
export function statsFromEvents(events: ActivityEvent[], since: number, now = Date.now()): Required<Pick<BridgeStats, 'packs' | 'lastBig' | 'topPuller'>> {
  const recap = buildStreamRecap(events, since, now);
  const p = lastPull(events, since, true, now);
  return { packs: recap.packs, lastBig: p ? { username: p.username, cardName: p.cardName } : null, topPuller: recap.topPuller };
}

/** The newest pull since `since` (`big`: of BIG_PULL_STARS or more), never a test pull; null when there is none. */
export function lastPull(events: ActivityEvent[], since: number, big: boolean, now = Date.now()): PullEvent | null {
  for (const e of events) {
    const p = e.at >= since && e.at <= now && !e.test ? asPullEvent(e) : null;
    if (p && (!big || p.stars >= BIG_PULL_STARS)) return p;
  }
  return null;
}

/** The Stream Deck's Show last pull keys: the newest pull (or big pull) of this stream. */
export async function readLastPull(big: boolean): Promise<PullEvent | null> {
  const [{ events }, key] = await Promise.all([getActivity({ limit: 500 }), currentStreamKey()]);
  return lastPull(events, streamStart(key), big);
}

/** Only what was asked for (`want`), so a queue-only app never reads the log. */
export async function readBridgeStats(want: readonly StatKey[]): Promise<BridgeStats> {
  const out: BridgeStats = {};
  if (want.includes('queue')) out.queue = await queueLength();
  if (want.includes('goal')) out.goal = await packGoalText(); // ROADMAP 57.5: counted per pull, not read from the log
  const fromLog = want.filter((k): k is 'packs' | 'lastBig' | 'topPuller' => k !== 'queue' && k !== 'goal');
  if (fromLog.length) {
    const [{ events }, key] = await Promise.all([getActivity({ limit: 500 }), currentStreamKey()]);
    const s = statsFromEvents(events, streamStart(key));
    for (const k of fromLog) Object.assign(out, { [k]: s[k] });
  }
  return out;
}

/** The `stats` list of a `status` request: only known keys, once each. */
export const cleanWanted = (raw: unknown): StatKey[] => (Array.isArray(raw) ? STAT_KEYS.filter(k => raw.includes(k)) : []);
