// Pull limits kept with each viewer (ROADMAP 12.4). The Mix It Up tab sets the DEFAULT number of paid pulls per stream; a viewer can
// have their own base limit, and temporary bonuses ("buffs": +N pulls per stream until a time) on top of it. Buff cards are meant to
// add rows to `buffs` later, which is why a buff records where it came from. Pure: no database.

export interface PullBuff {
  id: string;
  /** Extra pulls per stream while the buff lasts. */
  amount: number;
  /** When it ends (ms since epoch); null = until removed. */
  until: number | null;
  /** Who or what granted it: 'admin', later e.g. 'card:<id>'. */
  source: string;
  note?: string;
}

export interface UserPullLimit {
  /** This viewer's own base limit per stream; null = use the default from Settings. 0 = no limit. */
  limit: number | null;
  buffs: PullBuff[];
}

export const NO_PULL_LIMIT: UserPullLimit = { limit: null, buffs: [] };
export const MAX_LIMIT = 1000;
export const MAX_BUFFS = 20;
export const MAX_BUFF_HOURS = 24 * 365;

const int = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : null;
};

/** Whatever is stored (or nothing), as a complete, safe record. */
export function normalizePullLimit(raw: unknown): UserPullLimit {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const buffs: PullBuff[] = [];
  if (Array.isArray(r.buffs)) {
    for (const b of r.buffs) {
      if (!b || typeof b !== 'object') continue;
      const o = b as Record<string, unknown>;
      const amount = typeof o.amount === 'number' && o.amount >= 1 ? int(o.amount, 1, MAX_LIMIT) : null;
      if (amount === null || typeof o.id !== 'string' || !o.id) continue;
      buffs.push({
        id: o.id.slice(0, 60), amount, until: typeof o.until === 'number' && Number.isFinite(o.until) ? o.until : null,
        source: typeof o.source === 'string' && o.source ? o.source.slice(0, 60) : 'admin',
        ...(typeof o.note === 'string' && o.note.trim() ? { note: o.note.trim().slice(0, 120) } : {}),
      });
      if (buffs.length >= MAX_BUFFS) break;
    }
  }
  return { limit: r.limit === null || r.limit === undefined ? null : int(r.limit, 0, MAX_LIMIT), buffs };
}

export const isActive = (b: PullBuff, now: number) => b.until === null || b.until > now;

/** One extra for every viewer, only while its stream key still matches. Amount 0 is not stored. */
export interface StreamPullBuff {
  amount: number;
  streamKey: string;
  by: string;
  at: number;
}

/** A whole number of extra pulls, or null when the input is not usable. 0 is allowed (it clears the bonus). */
export function streamAmount(value: unknown): number | null {
  return int(value, 0, MAX_LIMIT);
}

export function normalizeStreamBuff(raw: unknown): StreamPullBuff | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const amount = streamAmount(o.amount);
  if (amount === null || amount < 1 || typeof o.streamKey !== 'string' || !o.streamKey) return null;
  return {
    amount,
    streamKey: o.streamKey.slice(0, 40),
    by: typeof o.by === 'string' && o.by ? o.by.slice(0, 60) : 'admin',
    at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0,
  };
}

/** How many extra pulls this stream key still grants. A different key (the stream ended) grants none. */
export function streamBuffAmount(rec: StreamPullBuff | null, streamKey: string): number {
  return rec && rec.streamKey === streamKey ? rec.amount : 0;
}

/**
 * What this viewer may pull per stream: their own base (else the role default), plus every personal buff still running, plus
 * `extra` for this stream (the everyone-bonus, and later a community buff added by the caller). A base of 0 means no limit, and
 * neither buffs nor `extra` can change that. `limit` 0 = unlimited.
 */
export function effectiveLimit(defaultLimit: number, rec: UserPullLimit, now = Date.now(), extra = 0): { limit: number; base: number; bonus: number; custom: boolean } {
  const base = rec.limit ?? defaultLimit;
  const bonus = rec.buffs.filter(b => isActive(b, now)).reduce((s, b) => s + b.amount, 0);
  const stream = base === 0 ? 0 : Math.max(0, Math.floor(extra) || 0);
  return { limit: base === 0 ? 0 : base + bonus + stream, base, bonus, custom: rec.limit !== null };
}

/** Sets (or clears, with null) the viewer's own base limit. */
export function withBase(rec: UserPullLimit, value: unknown): UserPullLimit {
  return { ...rec, limit: value === null || value === '' || value === undefined ? null : int(value, 0, MAX_LIMIT) };
}

/** Adds a bonus. `hours` null/0 = until removed. Ended buffs are dropped. Returns null when the input is not usable or the list is full. */
export function withBuff(rec: UserPullLimit, o: { id: string; amount: unknown; hours?: unknown; source?: string; note?: string }, now = Date.now()): UserPullLimit | null {
  const wanted = typeof o.amount === 'number' ? o.amount : typeof o.amount === 'string' && o.amount.trim() !== '' ? Number(o.amount) : NaN;
  if (!(wanted >= 1)) return null; // 0, negative or not a number: refuse rather than quietly make it 1
  const amount = int(wanted, 1, MAX_LIMIT)!;
  const hours = o.hours === null || o.hours === undefined || o.hours === '' ? 0 : int(o.hours, 0, MAX_BUFF_HOURS);
  if (hours === null) return null;
  const live = rec.buffs.filter(b => isActive(b, now));
  if (live.length >= MAX_BUFFS) return null;
  const buff: PullBuff = { id: o.id, amount, until: hours > 0 ? now + hours * 3_600_000 : null, source: o.source || 'admin', ...(o.note?.trim() ? { note: o.note.trim().slice(0, 120) } : {}) };
  return { ...rec, buffs: [...live, buff] };
}

export function withoutBuff(rec: UserPullLimit, id: string): UserPullLimit {
  return { ...rec, buffs: rec.buffs.filter(b => b.id !== id) };
}

/** Nothing worth storing (so the key can be deleted). */
export const isEmpty = (rec: UserPullLimit) => rec.limit === null && rec.buffs.length === 0;
