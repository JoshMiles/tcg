import { isEscrow, parseUid, type Copy, type Origin } from './serials-core';

// Pure helpers for the admin Prints screen (/admin/serials): what a typed search means, which filters a view carries, and what a
// "return to the list" address may be. No database here, so scripts/check-serials-view.mts can cover them.

export type PrintSearch =
  | { kind: 'none' }
  | { kind: 'uid'; uid: number }
  | { kind: 'text'; text: string };

/** A typed search: a print number ("#1023381" or "1023381"), or free text (a login or a card name, decided by the page). */
export function parsePrintSearch(raw: string | undefined): PrintSearch {
  const q = (raw ?? '').trim().slice(0, 60);
  if (!q) return { kind: 'none' };
  const uid = parseUid(q);
  return uid ? { kind: 'uid', uid } : { kind: 'text', text: q };
}

export const ORIGINS: Origin[] = ['pull', 'grant', 'upgrade', 'estimated', 'other'];
export const parseOrigin = (v: string | undefined): Origin | '' => (ORIGINS as string[]).includes(v ?? '') ? (v as Origin) : '';
export const cleanHolder = (v: string | undefined) => (v ?? '').trim().replace(/^@/, '').toLowerCase().slice(0, 40);

/** Editions of one card version, oldest first (the order chips are drawn in), narrowed by holder ("retired" and "offer" are holders too) and origin. */
export function filterEditions(copies: Copy[], f: { holder?: string; origin?: Origin | '' }): Copy[] {
  const holder = cleanHolder(f.holder);
  return copies
    .filter(c => {
      if (f.origin && c.origin !== f.origin) return false;
      if (!holder) return true;
      if (holder === 'retired') return !c.owner;
      if (holder === 'offer') return !!c.owner && isEscrow(c.owner);
      return c.owner === holder;
    })
    .sort((a, b) => a.n - b.n);
}

/** Where an action may send the admin back to: only the Prints list itself (a query on /admin/serials), never another address. */
export function safeSerialsReturn(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 600) return null;
  if (!/^\/admin\/serials\?[A-Za-z0-9_=&%.+~#-]*$/.test(raw)) return null;
  return raw;
}

/** The same list address with the open print and any message changed. */
export function withParams(base: string, set: Record<string, string | undefined>): string {
  const [path, query = ''] = base.split('?');
  const q = new URLSearchParams(query);
  for (const [k, v] of Object.entries(set)) { if (v) q.set(k, v); else q.delete(k); }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
