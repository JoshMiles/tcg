import { getRecentPulls } from './site-data';
import { cardThumbUrl } from './card-art';
import { getRarity } from './rarity';
import { notableReason, type PullItem } from './home-data';
import type { Season } from './types';

/** The home feed's items: recent pulls in a season (collectors an admin hid are never included), each with its art and rarity colour. */
export async function recentPullItems(season: Season, cards: { number: number; imageUrl?: string }[], limit = 8): Promise<PullItem[]> {
  const byNumber = new Map(cards.map(c => [c.number, c]));
  const pulls = await getRecentPulls(season.collectionName, limit);
  return pulls.map(e => ({
    seq: e.seq, username: e.username, cardNumber: e.cardNumber, cardName: e.cardName, stars: e.stars, variant: e.variant, at: e.at,
    thumb: byNumber.get(e.cardNumber)?.imageUrl ? cardThumbUrl(byNumber.get(e.cardNumber)!.imageUrl!) : undefined,
    hex: getRarity(e.stars)?.hex,
    notable: notableReason(e) !== null,
  }));
}
