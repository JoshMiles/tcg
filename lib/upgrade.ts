import { getSeason, getPacksForSeason, getPackCards, withCollectionLock, getCollection, saveCollection } from './kv';
import { lastCopy, isTracking } from './serials';
import { favouriteIdsOf, spendablePrints } from './favourites';
import { getScoringSettings } from './scoring';
import { serialMultiplier } from './scoring-core';
import { recordActivity } from './activity';
import type { Variant } from './types';
import { VARIANT_LABELS, encodeEntry, removeEntries, upgradeStep, upgradesAllowed } from './variants';

export type UpgradeResult =
  | { ok: true; owned: number[]; cardName: string; from: Variant; to: Variant; cost: number; /** The serial the new copy got (null before the season's copies are numbered) and its points multiplier. */ serial: number | null; serialMult: number }
  | { ok: false; status: number; error: string };

/**
 * Swaps `cost` duplicates of one card variant for a single copy of the next variant up. Strictly one
 * step (regular → reverse → full → shiny → golden), same card only, active season only. Runs under the
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

  if (from === 'golden') return { ok: false, status: 400, error: `${VARIANT_LABELS[from]} can't be upgraded any further.` };

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

  // The next variant that is switched on for this pack and card (a switched-off one is skipped at the combined cost).
  const step = upgradeStep(pack, card, from);
  if (!step) return { ok: false, status: 400, error: `${VARIANT_LABELS[from]} can't be upgraded any further for this card.` };
  const { to, cost } = step;
  const fromEntry = encodeEntry(cardNumber, from);

  let made: { copyId: string | null; uid: number | null } = { copyId: null, uid: null };
  const result = await withCollectionLock(season.collectionName, async (): Promise<UpgradeResult> => {
    const data = await getCollection(season.collectionName);
    const owned = data[username] ?? [];
    const remaining = removeEntries(owned, fromEntry, cost);
    if (!remaining) {
      const have = owned.filter(e => e === fromEntry).length;
      return {
        ok: false,
        status: 400,
        error: `You need ${cost} ${VARIANT_LABELS[from]} editions to upgrade; you have ${have}.`,
      };
    }
    // Favourite prints are never spent: the cost is paid from the newest prints that are not favourites.
    let spend: string[] | undefined;
    if (await isTracking(season.collectionName)) {
      const r = await spendablePrints(season.collectionName, username, fromEntry, cost, undefined, await favouriteIdsOf(season.collectionName, username), 'spend');
      if (!r.ok) return { ok: false, status: 400, error: r.text };
      spend = r.ids ?? undefined;
    }
    const updated = [...remaining, encodeEntry(cardNumber, to)];
    data[username] = updated;
    await saveCollection(season.collectionName, data, { upgrade: { user: username, spent: fromEntry, count: cost, made: encodeEntry(cardNumber, to), ...(spend ? { ids: spend } : {}) } });
    const last = await lastCopy(season.collectionName, encodeEntry(cardNumber, to));
    const serial = last.serial;
    made = last;
    const mult = serial ? serialMultiplier(serial, await getScoringSettings()) : 1;
    return { ok: true, owned: updated, cardName: card.name, from, to, cost, serial, serialMult: Math.round(mult * 100) / 100 };
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
      ...(made.copyId ? { copyId: made.copyId } : {}),
      ...(made.uid ? { uid: made.uid } : {}),
    });
  }
  return result;
}
