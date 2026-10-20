import { buildProvenance } from './provenance';
import { isEscrow, type Copy } from './serials-core';

// Edition of the week (pure, client-safe): how interesting a print's journey is, and which print to feature. The cron and the admin
// buttons that store the pick live in lib/print-of-week-store.ts.

const WEEK_MS = 7 * 24 * 3_600_000;
/** Weeks of age that still count. */
export const AGE_CAP_WEEKS = 8;
/** A print picked within this many weeks is not picked again (the history keeps the newest `HISTORY_KEEP`). */
export const SKIP_WEEKS = 8;
export const HISTORY_KEEP = 20;

export interface PotwParts {
  holders: number;
  trades: number;
  first: boolean;
  /** Shiny or Full Art. */
  rare: boolean;
  ageWeeks: number;
  forged: boolean;
}

export interface Scored { score: number; parts: PotwParts; reason: string }

/** The pick stored at `potw:current`. */
export interface PotwPick { uid: number; seasonId: string; copyId: string; score: number; reason: string; chosenAt: number; by: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Held by 5 collectors, traded 4 times, 9 weeks old" from the parts that earned points. */
export function reasonText(p: PotwParts): string {
  const out: string[] = [`Held by ${plural(p.holders, 'collector')}`];
  if (p.trades > 0) out.push(`traded ${p.trades === 1 ? 'once' : `${p.trades} times`}`);
  if (p.first) out.push('the first edition ever made');
  if (p.forged) out.push('forged from other prints');
  if (p.ageWeeks > 0) out.push(`${plural(p.ageWeeks, 'week')} old`);
  return out.join(', ');
}

/**
 * Points for a print's journey: distinct holders x3, completed trades x2, edition #1 +5, Shiny / Full Art +2, age in weeks (cap 8) x1,
 * forged from other prints +2. Null when it cannot be featured: spent, in a trade offer, or without a edition number.
 */
export function scorePrint(copy: Pick<Copy, 'ev' | 'owner' | 'at' | 'n' | 'variant' | 'origin' | 'madeFrom' | 'uid'>, now = Date.now()): Scored | null {
  if (!copy.uid || !copy.owner || isEscrow(copy.owner)) return null;
  const prov = buildProvenance(copy, now);
  const parts: PotwParts = {
    holders: Math.max(1, prov.holders.length),
    trades: prov.trades,
    first: copy.n === 1,
    rare: copy.variant === 'shiny' || copy.variant === 'full',
    ageWeeks: Math.min(AGE_CAP_WEEKS, Math.floor(prov.ageMs / WEEK_MS)),
    forged: copy.origin === 'upgrade' || (copy.madeFrom?.length ?? 0) > 0,
  };
  const score = parts.holders * 3 + parts.trades * 2 + (parts.first ? 5 : 0) + (parts.rare ? 2 : 0) + parts.ageWeeks + (parts.forged ? 2 : 0);
  return { score, parts, reason: reasonText(parts) };
}

export interface Candidate extends Scored { uid: number; copyId: string; at: number }

/** The best candidate that was not picked recently: highest score, the older print on a tie (then the lower edition number). */
export function pickPrintOfWeek(candidates: Candidate[], recentUids: number[]): Candidate | null {
  const skip = new Set(recentUids);
  const pool = candidates.filter(c => !skip.has(c.uid));
  pool.sort((a, b) => b.score - a.score || a.at - b.at || a.uid - b.uid);
  return pool[0] ?? null;
}

export interface PotwHistoryEntry { uid: number; at: number }

/** Newest first, no repeats, capped. */
export const pushHistory = (history: PotwHistoryEntry[], uid: number, at: number): PotwHistoryEntry[] => [{ uid, at }, ...history.filter(h => h.uid !== uid)].slice(0, HISTORY_KEEP);

/** The uids picked within the last `SKIP_WEEKS` weeks, which are not picked again. */
export const recentUids = (history: PotwHistoryEntry[], now = Date.now()): number[] => history.filter(h => now - h.at < SKIP_WEEKS * WEEK_MS).map(h => h.uid);

/** ISO week key "2026-W42" (UTC), so the cron runs its pick once per week. */
export function isoWeekKey(ms: number): string {
  const d = new Date(Date.UTC(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth(), new Date(ms).getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
