// TCG Bridge's pre-stream checklist (ROADMAP 57.1), the pure part. The app runs the checks and reports the lines; lib/bridge-checklist.ts keeps the last report in KV.

export type ChecklistTone = 'ok' | 'bad' | 'muted';
export interface ChecklistLine { label: string; tone: ChecklistTone; text: string }
export interface ChecklistResult { at: number; ready: boolean; lines: ChecklistLine[] }

const LINES_MAX = 12;
const TONES: readonly string[] = ['ok', 'bad', 'muted'];
const cut = (v: unknown, n: number): string => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** The lines of a report from the app, cleaned (a wrong shape is null). `ready` is worked out here: no line is red. */
export function cleanChecklist(raw: unknown, now: number): ChecklistResult | null {
  const list = (raw as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(list) || list.length === 0) return null;
  const lines: ChecklistLine[] = [];
  for (const l of list.slice(0, LINES_MAX) as Record<string, unknown>[]) {
    const label = cut(l?.label, 40);
    if (!label || typeof l.tone !== 'string' || !TONES.includes(l.tone)) return null;
    lines.push({ label, tone: l.tone as ChecklistTone, text: cut(l.text, 300) });
  }
  return { at: now, ready: lines.every(l => l.tone !== 'bad'), lines };
}

/** The stored value read back; anything that no longer fits is null. */
export function readChecklistValue(raw: unknown): ChecklistResult | null {
  const r = raw as { at?: unknown } | null;
  const at = Number(r?.at);
  return Number.isFinite(at) && at > 0 ? cleanChecklist(raw, at) : null;
}

/** "ran 5 minutes ago". */
export function ranAgo(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 1) return 'ran just now';
  if (m < 60) return `ran ${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `ran ${h} hour${h === 1 ? '' : 's'} ago`;
  return `ran ${Math.round(h / 24)} days ago`;
}
