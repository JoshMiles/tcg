import { getUserSettings } from './user-settings-store';
import { getOwnerCopies, isTracking, printLabel } from './serials';
import { entryOf, newestFirst } from './serials-core';
import type { TradeItem } from './trade-core';
import { encodeEntry } from './variants';

// Favourite prints (ROADMAP 9.1): a viewer marks prints by unique number (Copy.uid) and they can't be traded or spent in an
// upgrade. Checked against the live owner whenever it is used, so a favourite that has left them simply stops counting.

/** Ids of the prints `owner` holds right now that they have marked as favourites. */
export async function favouriteIdsOf(collection: string, owner: string): Promise<Set<string>> {
  const s = await getUserSettings(owner);
  if (s.favourites.length === 0) return new Set();
  const favs = new Set(s.favourites);
  return new Set((await getOwnerCopies(collection, owner)).filter(c => c.uid && favs.has(c.uid)).map(c => c.id));
}

export type Spend = { ok: true; ids: string[] | null } | { ok: false; text: string };

/**
 * Which prints of one stack may be spent. `picked` are exact picks: a favourite among them is refused. With no picks the newest
 * non-favourite prints are chosen; `ids: null` means the owner has no favourite of this card, so the ledger's own newest-first
 * choice is already safe and nothing needs pinning.
 */
export async function spendablePrints(collection: string, owner: string, entry: number, count: number, picked: string[] | undefined, favs: Set<string>, verb: 'trade' | 'spend' = 'trade'): Promise<Spend> {
  if (favs.size === 0) return { ok: true, ids: null };
  if (picked) {
    const hit = picked.find(id => favs.has(id));
    if (hit) return { ok: false, text: `${await printLabel(collection, hit)} is one of your favourites. Unfavourite it first to ${verb} it.` };
    return { ok: true, ids: picked };
  }
  const mine = (await getOwnerCopies(collection, owner)).filter(c => entryOf(c) === entry);
  if (!mine.some(c => favs.has(c.id))) return { ok: true, ids: null };
  const free = mine.filter(c => !favs.has(c.id));
  if (free.length < count) {
    return { ok: false, text: free.length === 0
      ? `You only have favourites of that card left. Unfavourite one to ${verb} it.`
      : `Some of your editions of that card are favourites, so only ${free.length} can be ${verb === 'trade' ? 'traded' : 'spent'}. Unfavourite one to use more.` };
  }
  return { ok: true, ids: newestFirst(free, count).map(c => c.id) };
}

/** `items` with the unpicked stacks pinned to non-favourite prints where the owner has favourites; the first refusal otherwise. */
export async function protectFavourites(collection: string, owner: string, items: TradeItem[]): Promise<{ ok: true; items: TradeItem[] } | { ok: false; text: string }> {
  if (!(await isTracking(collection))) return { ok: true, items };
  const favs = await favouriteIdsOf(collection, owner);
  if (favs.size === 0) return { ok: true, items };
  const out: TradeItem[] = [];
  for (const i of items) {
    const r = await spendablePrints(collection, owner, encodeEntry(i.cardNumber, i.variant), i.count, i.ids, favs);
    if (!r.ok) return r;
    out.push(r.ids && !i.ids ? { ...i, ids: r.ids } : i);
  }
  return { ok: true, items: out };
}
