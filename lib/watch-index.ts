import { kv } from './db';
import { getAllCollectionUsers } from './kv';
import { getUserSettings } from './user-settings-store';
import { alertCards, wantedCounts } from './watch-core';
import type { Trade } from './trade-core';
import type { UserSettings } from './user-settings';

// Who wants to hear about which card: a KV set per card number (`watch:idx:<card>`) of the viewers whose Looking for list or saved
// alerts include it, kept up to date whenever settings are saved (lib/user-settings-store.ts). Without it a new listing would have to
// read every viewer's settings. The first lookup builds the index from the viewers who have played (no key scan: sandboxes can't).

const setKey = (card: number) => `watch:idx:${card}`;
const READY = 'watch:idx:ready';

/** Brings the index in line with a viewer's settings after a save. `prev` null = nothing was stored before. Never throws. */
export async function syncWatchIndex(username: string, prev: Pick<UserSettings, 'wanted' | 'watches'> | null, next: Pick<UserSettings, 'wanted' | 'watches'>): Promise<void> {
  try {
    const u = username.toLowerCase();
    const before = new Set(prev ? alertCards(prev) : []);
    const after = new Set(alertCards(next));
    for (const c of after) if (!before.has(c)) await kv.sadd(setKey(c), u);
    for (const c of before) if (!after.has(c)) await kv.srem(setKey(c), u);
  } catch { /* the index is rebuilt from settings on demand */ }
}

async function ensureIndex(): Promise<void> {
  if (await kv.get(READY).catch(() => null)) return;
  const users = await getAllCollectionUsers().catch(() => []);
  for (const { username } of users) await syncWatchIndex(username, null, await getUserSettings(username));
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
