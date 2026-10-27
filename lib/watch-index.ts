import { kv } from './db';
import { getAllCollectionUsers } from './kv';
import { loadUserSettings } from './user-settings-store';
import { alertCards, wantedCounts } from './watch-core';
import type { Trade } from './trade-core';
import type { UserSettings } from './user-settings';

// Who wants to hear about which card: a KV set per card number (`watch:idx:<card>`) of the viewers whose Looking for list or saved
// alerts include it, kept up to date whenever settings are saved (lib/user-settings-store.ts). Without it a new listing would have to
// read every viewer's settings. The first lookup builds the index from the viewers who have played (no key scan: sandboxes can't).

const setKey = (card: number) => `watch:idx:${card}`;
const READY = 'watch:idx:ready';

type Cards = Pick<UserSettings, 'wanted' | 'watches'>;

async function applySync(username: string, prev: Cards | null, next: Cards): Promise<void> {
  const u = username.toLowerCase();
  const before = new Set(prev ? alertCards(prev) : []);
  const after = new Set(alertCards(next));
  for (const c of after) if (!before.has(c)) await kv.sadd(setKey(c), u);
  for (const c of before) if (!after.has(c)) await kv.srem(setKey(c), u);
}

const firedKey = (u: string) => `watch:last:${u.toLowerCase()}`;

/** Remembers that a listing alert just reached this viewer (read back by `lastAlertAt` for Settings). Never throws. */
export async function markAlertFired(username: string, at = Date.now()): Promise<void> {
  try { await kv.set(firedKey(username), at); } catch { /* best effort */ }
}

/** When a listing alert last reached this viewer, or null (never, or not readable). */
export async function lastAlertAt(username: string): Promise<number | null> {
  const v = await kv.get<number>(firedKey(username)).catch(() => null);
  return typeof v === 'number' ? v : null;
}

/** Brings the index in line with a viewer's settings after a save. `prev` null = nothing was stored before. Never throws. */
export async function syncWatchIndex(username: string, prev: Cards | null, next: Cards): Promise<void> {
  try { await applySync(username, prev, next); } catch { /* the index is rebuilt from settings on demand */ }
}

async function ensureIndex(): Promise<void> {
  if (await kv.get(READY).catch(() => null)) return;
  // Any failed read or write throws out of here and leaves READY unset, so the next lookup builds the index again.
  const users = await getAllCollectionUsers();
  for (const { username } of users) await applySync(username, null, await loadUserSettings(username));
  await kv.set(READY, Date.now());
}

/** The viewers who asked to hear about any of these cards (a viewer appears once). Empty on any failure. */
export async function watchersOf(cards: number[]): Promise<string[]> {
  try {
    await ensureIndex();
    const found = new Set<string>();
    for (const c of new Set(cards)) for (const u of ((await kv.smembers(setKey(c))) as string[]) ?? []) found.add(u);
    return [...found];
  } catch { return []; }
}

/** How many viewers want each of these cards (set sizes only, names are not read). Cards nobody wants are left out. Empty on any failure. */
export async function watcherCounts(cards: number[]): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  try {
    await ensureIndex();
    for (const c of new Set(cards)) { const n = Number(await kv.scard(setKey(c))) || 0; if (n > 0) out[c] = n; }
  } catch { /* none */ }
  return out;
}

/** Who wants each of these cards, one read per distinct card. Empty on any failure. */
export async function watchersByCard(cards: number[]): Promise<Record<number, string[]>> {
  const out: Record<number, string[]> = {};
  try {
    await ensureIndex();
    for (const c of new Set(cards)) out[c] = ((await kv.smembers(setKey(c))) as string[]) ?? [];
  } catch { /* none */ }
  return out;
}

/** Wanted counts for open board listings, keyed by trade id; one batch of reads for all of them (not per viewer, not per listing). */
export async function wantedForTrades(trades: Trade[]): Promise<Record<string, Record<number, number>>> {
  const listings = trades.filter(t => t.kind === 'listing' && t.status === 'open');
  if (listings.length === 0) return {};
  const by = await watchersByCard(listings.flatMap(t => t.give.map(i => i.cardNumber)));
  const out: Record<string, Record<number, number>> = {};
  for (const t of listings) {
    const counts = wantedCounts(t.give, by, [t.from, ...(t.to ? [t.to] : [])]);
    if (Object.keys(counts).length > 0) out[t.id] = counts;
  }
  return out;
}
