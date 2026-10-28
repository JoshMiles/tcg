// TCG Bridge error reports (ROADMAP 57.9), the pure part: cleaning what the app sends. The KV side is lib/bridge-errors.ts.

export const ERROR_PARTS = ['job', 'reconnect', 'obs', 'mixitup'] as const;
export type ErrorPart = (typeof ERROR_PARTS)[number];
export const PART_LABEL: Record<ErrorPart, string> = { job: 'Job', reconnect: 'Reconnect', obs: 'OBS', mixitup: 'Mix It Up' };

/** One stored report. `at` is the site's clock, `pc` the name of the paired PC that sent it. */
export interface BridgeErrorRow { at: number; pc: string; part: ErrorPart; message: string; version: string; commit: string }

export const ERRORS_KEPT = 50;
export const BURST_COUNT = 10;
export const BURST_WINDOW_S = 600;
const DAY_MS = 86_400_000;

const oneLine = (v: unknown, n: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** A report from the app, cleaned; null when the part is not on the list or there is no message. */
export function cleanError(raw: unknown, pc: string, now: number): BridgeErrorRow | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const part = ERROR_PARTS.find(p => p === o.part);
  const message = oneLine(o.message, 300);
  if (!part || !message) return null;
  const version = oneLine(o.version, 20);
  const commit = oneLine(o.commit, 40).toLowerCase();
  return { at: now, pc: oneLine(pc, 60), part, message, version: /^\d+\.\d+\.\d+$/.test(version) ? version : '', commit: /^[0-9a-f]{7,40}$/.test(commit) ? commit.slice(0, 7) : '' };
}

/** A stored value read back; anything that no longer fits is dropped. */
export function readErrorList(raw: unknown): BridgeErrorRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(r => { const at = Number((r as { at?: unknown } | null)?.at); const c = Number.isFinite(at) && at > 0 ? cleanError(r, String((r as { pc?: unknown }).pc ?? ''), at) : null; return c ? [c] : []; }).slice(0, ERRORS_KEPT);
}

/** How many of the kept reports are from the last 24 hours. */
export const errorsInLast24h = (list: BridgeErrorRow[], now: number): number => list.filter(e => e.at > now - DAY_MS).length;

export const errorDay = (at: number): string => new Date(at).toISOString().slice(0, 10);
