import type { Season } from './types';
import { VARIANTS, allowedVariants } from './variants';
import { getSeasonOverview } from './site-data';
import type { TradeCardInfo } from './trade-view-core';

export * from './trade-view-core';

/** Every card in a season, keyed by number, with what each variant is worth right now. */
export async function getTradeCards(season: Season): Promise<Record<number, TradeCardInfo>> {
  const overview = await getSeasonOverview(season);
  const out: Record<number, TradeCardInfo> = {};
  for (const c of overview.cards) {
    const v = overview.values.cards.get(c.number);
    out[c.number] = {
      number: c.number,
      name: c.name,
      imageUrl: c.imageUrl,
      fullArtImageUrl: c.fullArtImageUrl,
      stars: c.stars,
      packName: c.packName,
      variants: c.pack.upgradesEnabled && c.upgradesEnabled !== false ? allowedVariants(c.pack, c) : ['regular'],
      values: VARIANTS.map(variant => v?.values[variant] ?? 0),
    };
  }
  return out;
}
