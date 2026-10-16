import { getRecentCardArrivals } from './site-data';
import { cardThumbUrl } from './card-art';
import { getRarity } from './rarity';
import { copyHrefFor } from './copy-link';
import { notableReason, type PullItem } from './home-data';
import type { Season } from './types';

/**
 * The home feed's items: the newest cards in a season, pulled or granted (collectors an admin hid are never included), each with
 * its art and rarity colour. A grant event carries only the card number, so its name and stars come from the season's cards; a
 * grant of a card that no longer exists is left out.
 */
export async function recentPullItems(season: Season, cards: { number: number; name?: string; stars?: number; imageUrl?: string }[], limit = 8): Promise<PullItem[]> {
  const byNumber = new Map(cards.map(c => [c.number, c]));
  const arrivals = await getRecentCardArrivals(season.collectionName, limit * 2);
  const items: PullItem[] = [];
  for (const e of arrivals) {
    const card = byNumber.get(e.cardNumber);
    const grant = e.type === 'grant';
    const cardName = e.type === 'pull' ? e.cardName : card?.name;
    const stars = e.type === 'pull' ? e.stars : card?.stars;
    if (!cardName || stars === undefined) continue;
    items.push({
      seq: e.seq, username: e.username, cardNumber: e.cardNumber, cardName, stars, variant: e.variant, at: e.at,
      kind: grant ? 'grant' : 'pull',
      thumb: card?.imageUrl ? cardThumbUrl(card.imageUrl) : undefined,
      hex: getRarity(stars)?.hex,
      notable: notableReason({ variant: e.variant, stars, serial: e.type === 'pull' ? e.serial : undefined }) !== null,
      href: copyHrefFor(e, season.id) ?? `/cards?card=${e.cardNumber}`,
      ...(e.uid ? { uid: e.uid } : {}),
      ...(e.type === 'pull' && e.serial ? { serial: e.serial, ...(e.bonus ? { bonus: e.bonus } : {}) } : {}),
    });
    if (items.length >= limit) break;
  }
  return items;
}
