import { getSeason, getPacksForSeason, getPackCards, withCollectionLock, getCollection, saveCollection } from './kv';
import { recordActivity } from './activity';
import type { Variant } from './types';
import { VARIANT_LABELS, encodeEntry, nextVariant, removeEntries, upgradesAllowed } from './variants';

export type UpgradeResult =
  | { ok: true; owned: number[]; cardName: string; from: Variant; to: Variant; cost: number }
  | { ok: false; status: number; error: string };

/**
 * Swaps `cost` duplicates of one card variant for a single copy of the next variant up. Strictly one
 * step (regular → reverse → full → shiny), same card only, active season only. Runs under the
 * collection lock so it can't interleave with a pull or a grant writing the same blob.
 */
export async function upgradeCard(opts: {
  seasonId: string;
  username: string;
  cardNumber: number;
  from: Variant;
}): Promise<UpgradeResult> {
  const { seasonId, cardNumber, from } = opts;
  const username = opts.username.toLowerCase();

  const to = nextVariant(from);
  if (!to) return { ok: false, status: 400, error: `${VARIANT_LABELS[from]} can't be upgraded any further.` };

  const season = await getSeason(seasonId);
  if (!season) return { ok: false, status: 404, error: 'Season not found.' };
  if (!season.active) return { ok: false, status: 400, error: 'Cards can only be upgraded in the active season.' };

  const packs = await getPacksForSeason(season);
  const withCards = await Promise.all(packs.map(async pack => ({ pack, cards: await getPackCards(pack.id) })));
  const found = withCards
    .map(({ pack, cards }) => ({ pack, card: cards.find(c => c.number === cardNumber) }))
    .find(x => x.card);
  if (!found?.card) return { ok: false, status: 404, error: 'That card is not in this season.' };
  const { pack, card } = found;
  if (!upgradesAllowed(pack, card)) return { ok: false, status: 400, error: 'Upgrades are turned off for this card.' };

  const cost = pack.upgradeCosts[to as Exclude<Variant, 'regular'>];
  const fromEntry = encodeEntry(cardNumber, from);

  const result = await withCollectionLock(season.collectionName, async (): Promise<UpgradeResult> => {
    const data = await getCollection(season.collectionName);
    const owned = data[username] ?? [];
    const remaining = removeEntries(owned, fromEntry, cost);
    if (!remaining) {
      const have = owned.filter(e => e === fromEntry).length;
      return {
        ok: false,
        status: 400,
        error: `You need ${cost} ${VARIANT_LABELS[from]} copies to upgrade; you have ${have}.`,
      };
    }
    const updated = [...remaining, encodeEntry(cardNumber, to)];
    data[username] = updated;
    await saveCollection(season.collectionName, data);
    return { ok: true, owned: updated, cardName: card.name, from, to, cost };
  });

  if (result.ok) {
    await recordActivity({
      type: 'upgrade',
      username,
      collectionName: season.collectionName,
      cardNumber,
      cardName: card.name,
      from,
      to,
      cost,
    });
  }
  return result;
}
