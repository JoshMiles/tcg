// Timed trade restrictions (ROADMAP 51.3). TRIAL for one season: a "Block trading" restriction may carry an `until` (ms) after which
// it no longer applies. It lifts lazily: every reader asks `tradeBlockedNow`; nothing sweeps, and the stored flag is tidied on the next save.
// Decide at the end of the season whether to keep it (success: fewer manual lifts). Pure, so checks and client components can use it.

/** The "Lifts after" choices, in days. 0 = no end (as before). */
export const RESTRICTION_DAYS = [0, 1, 3, 7, 30] as const;
/** Form value meaning "leave the current end date as it is" (only offered while a timed restriction is live). */
export const KEEP_UNTIL = -1;

export interface TradeFlags { noTrading?: boolean; until?: number }

/** True while the viewer is barred from trading: the flag is set and its end (if any) has not passed. */
export function tradeBlockedNow(flags: TradeFlags | undefined | null, now = Date.now()): boolean {
  return !!flags?.noTrading && !(flags.until && flags.until <= now);
}

/** The end of a live timed block, or undefined (not blocked, or no end). */
export function liveUntil(flags: TradeFlags | undefined | null, now = Date.now()): number | undefined {
  return tradeBlockedNow(flags, now) && flags?.until ? flags.until : undefined;
}

/** The stored end for a form choice, or undefined for "no end". Anything outside the allowed choices means no end. */
export function untilFromDays(days: number, now = Date.now()): number | undefined {
  return (RESTRICTION_DAYS as readonly number[]).includes(days) && days > 0 ? now + days * 86_400_000 : undefined;
}

export const formatUntil = (until: number) => new Date(until).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC';
