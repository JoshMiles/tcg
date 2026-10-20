import type { Season } from './types';
import { VARIANTS, allowedVariants } from './variants';
import { getSeasonOverview } from './site-data';
import { printPoolOf, type PrintPool, type TradeCardInfo, type TradePools } from './trade-view-core';
import type { Trade } from './trade-core';
import { getCopy, getOwnerCopies, isTracking, loadSerialIndex } from './serials';
import { poolOf, type SerialPool } from './serials-core';


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
      raw: VARIANTS.map(variant => v?.maths.raw[variant] ?? 0),
      bonus: { max: overview.values.settings.serialBonusMax, cutoff: overview.values.settings.serialBonusCutoff },
    };
  }
  return out;
}

export async function getTradePools(season: Season, trades: Trade[], viewer?: string | null): Promise<TradePools> {
  const idx = await loadSerialIndex(season.collectionName);
  const give: Record<string, SerialPool> = {};
  for (const t of trades) if (t.seasonId === season.id && t.escrowed) give[t.id] = poolOf(idx?.escrow.get(t.id));
  // Exact prints named by the trades shown: their unique numbers, for "Edition #1023381".
  const uids: Record<string, number> = {};
  const picked = trades.filter(t => t.seasonId === season.id).flatMap(t => [...t.give, ...t.get]).flatMap(i => i.ids ?? []);
  await Promise.all([...new Set(picked)].slice(0, 120).map(async id => { const u = (await getCopy(season.collectionName, id).catch(() => null))?.uid; if (u) uids[id] = u; }));
  return { viewer: viewer ?? null, give, mine: poolOf(viewer ? idx?.held.get(viewer) : undefined), uids };
}

/** The prints one viewer holds right now, by entry, for the print pickers ({} while the season's prints are not numbered). */
export async function getPrintPool(season: Season, owner: string): Promise<PrintPool> {
  if (!(await isTracking(season.collectionName))) return {};
  return printPoolOf(await getOwnerCopies(season.collectionName, owner));
}
