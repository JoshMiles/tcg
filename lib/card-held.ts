// Which of a pack's card numbers some viewer already holds. Viewers' collections point at card numbers, so a number that is held
// must not change: renumbering would hand every viewer's copies to whichever card carries the new number.
import { getCollection, listSeasons } from './kv';
import { decodeEntry } from './variants';

/**
 * The card numbers of `packId` that appear in a viewer's collection, in any version, across every season that uses the pack.
 * (Copies sitting in an open trade offer are out of the collection while it is open, so a card held only there counts as not held.)
 */
export async function heldCardNumbers(packId: string): Promise<Set<number>> {
  const seasons = (await listSeasons()).filter(s => s.packIds.includes(packId));
  const held = new Set<number>();
  for (const s of seasons) {
    const collection = await getCollection(s.collectionName);
    for (const entries of Object.values(collection)) for (const entry of entries) held.add(decodeEntry(entry).cardNumber);
  }
  return held;
}
