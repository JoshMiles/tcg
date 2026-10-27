import { listSeasons } from './kv';
import { getSnapshot } from './season-wrap';
import { getCollectionCached } from './leaderboard';
import { getSeasonOverview } from './site-data';
import { computeUserStats } from './user-stats';
import { getOwnerCopies } from './serials';
import { tradeHistory } from './trades';
import { buildStatsCard, tradesInSeason, wrappedRow } from './share-stats';
import { usesFullArt } from './variants';
import { getRarity } from './rarity';
import type { ShareSpec } from './share-image';

/**
 * The "Season wrapped" share image: the stats card of the most recent ended season the viewer is in the snapshot of. Rank, score, pulls
 * and cards come from the frozen standings; best and rarest edition and trades from the season's own data. Null when there is none.
 * shortcut: only the latest such season is offered and a snapshot keeps the top 100 only; list older seasons if players ask.
 */
export async function loadSeasonWrapped(username: string, displayName: string, siteHost: string): Promise<{ seasonName: string; spec: ShareSpec } | null> {
  const ended = (await listSeasons()).filter(s => s.endedAt).sort((a, z) => (z.endedAt ?? 0) - (a.endedAt ?? 0));
  for (const season of ended) {
    const snap = await getSnapshot(season.id);
    const mine = snap ? wrappedRow(snap.standings, username) : null;
    if (!snap || !mine) continue;
    const [overview, collection, copies, log] = await Promise.all([getSeasonOverview(season), getCollectionCached(season), getOwnerCopies(season.collectionName, username), tradeHistory().catch(() => [])]);
    const s = computeUserStats(overview, username, collection[username] ?? [], collection, { upgrades: false });
    const card = (n: number) => overview.cards.find(c => c.number === n);
    return {
      seasonName: snap.seasonName,
      spec: {
        title: displayName,
        subtitle: `@${username} · ${snap.seasonName} wrapped`,
        statsCard: buildStatsCard({
          rank: mine.rank, score: mine.row.score, uniqueCards: mine.row.uniqueCards, totalCards: snap.stats.pool, copies: mine.row.copies,
          completionBonusPct: overview.values.settings.completionBonusPct,
          prints: copies.filter(c => c.owner === username),
          chance: (n, variant) => {
            const cv = overview.values.cards.get(n);
            if (!cv) return 0;
            const w = cv.maths.weights;
            const total = w.regular + w.reverse + w.full + w.shiny + (w.golden ?? 0);
            return total > 0 ? cv.pullRate * (w[variant] / total) : 0;
          },
          nameOf: n => card(n)?.name ?? `Card #${n}`,
          hexOf: n => getRarity(card(n)?.stars ?? 0)?.hex,
          tradesCompleted: tradesInSeason(log, season.id, username),
        }),
        cards: s.topCopies.slice(0, 3).map(t => ({
          src: usesFullArt(t.variant) && t.card.fullArtImageUrl ? t.card.fullArtImageUrl : t.card.imageUrl,
          name: t.card.name, hex: getRarity(t.card.stars)?.hex, tag: t.variant === 'regular' ? undefined : t.variant === 'reverse' ? 'RH' : t.variant === 'full' ? 'FA' : t.variant === 'shiny' ? 'FH' : 'GD',
        })),
        footer: siteHost,
      },
    };
  }
  return null;
}
