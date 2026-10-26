import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { InfoTip } from '@/app/components/InfoTip';
import { CardTile } from '@/app/components/CardTile';
import { TradeCard } from '@/app/components/trade/TradeCard';
import { TradeActions } from '@/app/components/trade/TradeActions';
import { pickPropsFor } from '@/lib/trade-view-core';
import { SerialChip } from '@/app/components/SerialChip';
import { getActivity } from '@/lib/activity';
import { listSeasons } from '@/lib/kv';
import { getSeasonOverview } from '@/lib/site-data';
import { computeUserStats } from '@/lib/user-stats';
import { topPrintLinks } from '@/lib/top-prints';
import { getTradeSettings, listOpenTrades, tradeHistory } from '@/lib/trades';
import { describeItems, firstMissing } from '@/lib/trade-core';
import { getTradeCards, getTradePools } from '@/lib/trade-view';
import { PUBLIC_ACTIVITY_TYPES, profileHref, publicActivityHref, type ActivityLink } from '@/lib/profile-url';
import { VARIANT_LABELS } from '@/lib/variants';
import { getRarity } from '@/lib/rarity';
import type { ProfileBase } from '@/lib/profile-data';
import { SITE_URL } from '@/lib/site';
import { CollectionGrid } from './CollectionGrid';
import type { GridCard } from './CollectionGrid';

const ago = (at: number) => {
  const m = Math.floor((Date.now() - at) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

const Empty = ({ icon, title, children }: { icon: Parameters<typeof Icon>[0]['name']; title: string; children?: React.ReactNode }) => (
  <div className="rind rounded-2xl px-6 py-12 text-center space-y-2">
    <span className="mx-auto w-12 h-12 rounded-2xl bg-white/4 border border-white/6 text-gray-500 flex items-center justify-center"><Icon name={icon} className="w-6 h-6" /></span>
    <p className="font-display text-xl font-bold text-white">{title}</p>
    {children && <p className="text-sm text-gray-400 max-w-md mx-auto">{children}</p>}
  </div>
);

/** The card grid, with the rarity tiles above it. Click a collected card for its details. */
export function CollectionTab({ b, grid, isOwner, tradeWith, prefs, mine }: { b: ProfileBase; grid: GridCard[]; isOwner: boolean; tradeWith?: string; prefs?: { hideUncollected: boolean; compactGrids: boolean }; mine?: Record<number, number> }) {
  const leaderboardHref = `/leaderboard/${b.season.id}`;
  if (b.allCards.length === 0) return <Empty icon="cards" title="No cards in this season yet">Check back once packs are added.</Empty>;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(7rem,1fr))]">
        {b.rarity.map(r => (
          <div key={r.stars} className="card rounded-xl p-3 text-center">
            <p className="text-xs font-medium mb-1" style={{ color: r.hex }}>{'★'.repeat(r.stars)}</p>
            <p className="text-lg font-bold text-white tabular-nums">{r.owned}/{r.total}</p>
            <p className="text-xs text-gray-600">{r.label}</p>
          </div>
        ))}
      </div>
      <CollectionGrid cards={grid} totalScore={b.row?.cardPoints ?? 0} leaderboardHref={leaderboardHref} canUpgrade={isOwner} ownerName={b.displayName} tradeWith={tradeWith} defaultHide={prefs?.hideUncollected ?? true} compact={prefs?.compactGrids ?? false} mine={mine} pinnedUid={isOwner ? b.settings.pinned ?? undefined : undefined} favouriteUids={isOwner ? b.settings.favourites : undefined} seasonId={b.season.id} binderConfig={b.settings.binder} defaultLayout={b.settings.collectionView} siteHost={SITE_URL.replace(/^https?:\/\//, '')} />
    </div>
  );
}

/** Points, bonuses, version mix and the most valuable copies: what makes up this collector's score. */
export async function StatsTab({ b }: { b: ProfileBase }) {
  const overview = await getSeasonOverview(b.season);
  // No upgrade projections here (the owner's own Stats tab adds them in OwnerStats, and they are the costly part).
  const s = computeUserStats(overview, b.lower, b.owned, b.collection, { upgrades: false });
  if (s.copies === 0) return <Empty icon="cheese" title="Nothing collected yet">{b.displayName} hasn&apos;t pulled a card this season.</Empty>;
  const printLinks = await topPrintLinks(b.season, s.topCopies.slice(0, 5));
  const mix = (['regular', 'reverse', 'full', 'shiny'] as const).map(v => ({ v, n: s.variants[v] }));
  const maxMix = Math.max(1, ...mix.map(m => m.n));
  return (
    <div className="grid gap-6 lg:grid-cols-2 items-start">
      <section className="card rounded-2xl p-5 space-y-3 lg:col-span-2">
        <h2 className="font-display text-xl font-bold text-white">Where the points come from</h2>
        <dl className="text-sm divide-y divide-gray-800/70">
          <div className="flex justify-between py-2"><dt className="text-gray-300">Cards <span className="text-gray-600">· every edition</span></dt><dd className="tabular-nums text-white">{Math.round(s.cardPoints - s.serialPoints).toLocaleString()}</dd></div>
          <div className="flex justify-between py-2"><dt className="text-gray-300">Edition bonus<InfoTip term="editionBonus" /> <span className="text-gray-600">· low numbers</span></dt><dd className={`tabular-nums ${s.serialPoints > 0 ? 'text-emerald-300' : 'text-gray-600'}`}>{s.serialPoints > 0 ? '+' : ''}{Math.round(s.serialPoints).toLocaleString()}</dd></div>
          <div className="flex justify-between py-2"><dt className="text-gray-300">Progress bonus<InfoTip term="progressBonus" /> <span className="text-gray-600">· {s.completionPct}% of the set</span></dt><dd className="tabular-nums text-emerald-300">+{Math.round(s.completionBonus).toLocaleString()}</dd></div>
          <div className="flex justify-between py-2"><dt className="text-gray-300">Full set bonus<InfoTip term="fullSetBonus" /></dt><dd className="tabular-nums text-emerald-300">{s.complete ? `+${Math.round(s.setBonus).toLocaleString()}` : <span className="text-gray-600">{s.totalCards - s.uniqueCards} card{s.totalCards - s.uniqueCards === 1 ? '' : 's'} to go</span>}</dd></div>
          {s.bonusPoints > 0 && <div className="flex justify-between py-2"><dt className="text-gray-300">Bonus points</dt><dd className="tabular-nums text-emerald-300">+{Math.round(s.bonusPoints).toLocaleString()}</dd></div>}
          <div className="flex justify-between py-2 font-bold"><dt className="text-white">Total</dt><dd className="tabular-nums text-yellow-300">{Math.round(s.score).toLocaleString()}</dd></div>
        </dl>
        <p className="text-xs text-gray-500"><Link href="/faq#points" className="text-yellow-500 hover:text-yellow-300">How points are worked out →</Link></p>
      </section>

      <section className="card rounded-2xl p-5 space-y-3">
        <h2 className="font-display text-xl font-bold text-white">Versions owned</h2>
        <ul className="space-y-2.5">
          {mix.map(m => (
            <li key={m.v} className="space-y-1">
              <div className="flex justify-between text-sm"><span className="text-gray-300">{VARIANT_LABELS[m.v]}</span><span className="tabular-nums text-gray-400">{m.n}</span></div>
              <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden"><div className="h-full rounded-full bg-yellow-400/80" style={{ width: `${m.n > 0 ? Math.max(3, (m.n / maxMix) * 100) : 0}%` }} /></div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500">{s.copies} pull{s.copies === 1 ? '' : 's'} in total.</p>
      </section>

      <section className="card rounded-2xl p-5 space-y-3">
        <h2 className="font-display text-xl font-bold text-white">Most valuable editions</h2>
        <ul className="divide-y divide-gray-800/70">
          {s.topCopies.slice(0, 5).map((t, i) => (
            <li key={`${t.card.number}-${t.variant}-${t.serial ?? 'all'}`}>
              <Link href={printLinks[i] ?? `/cards?card=${t.card.number}`} className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-lg hover:bg-gray-800/60 focus-visible:bg-gray-800/60 transition-colors">
              <span className="w-8 h-11 rounded-sm overflow-hidden bg-gray-800 shrink-0"><CardTile imageUrl={t.card.imageUrl} alt="" className="relative w-full h-full" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm text-white truncate">{t.card.name}</span><span className="block text-xs text-gray-500">{VARIANT_LABELS[t.variant]}{t.count > 1 ? ` ×${t.count}` : ''}{t.serial ? ` · #${t.serial}` : ''} <span className={getRarity(t.card.stars)?.text}>{'★'.repeat(t.card.stars)}</span></span></span>
              <span className="font-display font-bold text-yellow-400 tabular-nums">{t.value.toLocaleString()}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Their open listings on the trade board, plus how many trades they have completed. */
export async function TradesTab({ b, viewer }: { b: ProfileBase; viewer?: string }) {
  const [open, history, cards, settings] = await Promise.all([listOpenTrades(), tradeHistory(), getTradeCards(b.season), getTradeSettings()]);
  const listings = open.filter(t => t.kind === 'listing' && t.from === b.lower && t.seasonId === b.season.id);
  const completed = history.filter(t => t.status === 'accepted' && (t.from === b.lower || t.to === b.lower || t.resolvedBy === b.lower)).length;
  const mine = viewer ? b.collection[viewer] ?? [] : [];
  const pools = await getTradePools(b.season, listings, viewer);
  const nameOf = (n: number) => cards[n]?.name;
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400"><strong className="text-white">{completed}</strong> completed trade{completed === 1 ? '' : 's'} in the recent history · <Link href="/trade" className="text-yellow-500 hover:text-yellow-300">Open the trade board →</Link></p>
      {listings.length === 0 ? (
        <Empty icon="board" title="No open listings">{b.displayName} has nothing on the board right now.{viewer && viewer !== b.lower ? <> You can <Link href={`/trade/new?to=${encodeURIComponent(b.lower)}`} className="text-yellow-400 hover:text-yellow-300">offer them a trade</Link>.</> : null}</Empty>
      ) : listings.map(t => {
        const lack = viewer ? firstMissing(mine, t.get) : null;
        return (
          <TradeCard
            key={t.id} trade={t} cards={cards} pools={pools}
            title={<>{b.displayName}&rsquo;s listing</>}
            actions={viewer && viewer !== b.lower
              ? <TradeActions tradeId={t.id} mode="board" pick={pickPropsFor(t, viewer, cards)} canAccept={!lack && settings.enabled} blocked={lack ? `You need ${describeItems([lack], nameOf)}` : undefined} />
              : !viewer ? <span className="text-xs text-gray-500">Log in to take a trade</span> : undefined}
          />
        );
      })}
    </div>
  );
}

/** The card name, version and sequence, linked to the print when the event has one and to the card dex otherwise. */
function activityCard(e: ActivityLink & { serial?: number; bonus?: number }, seasonId: string, label: string, version?: string) {
  const href = publicActivityHref(e, seasonId);
  const body = (
    <>
      <strong>{label}</strong>
      {version ? <span className="text-purple-300"> ({version})</span> : null}
      {e.serial ? <SerialChip n={e.serial} bonus={e.bonus} className="ml-1.5 align-middle" /> : null}
    </>
  );
  return href
    ? <Link href={href} className="text-white hover:text-yellow-200">{body}</Link>
    : <span className="text-white">{body}</span>;
}

/** Recent pulls, upgrades and completed trades. Hidden collectors show nothing; admin actions and declined offers are never shown. */
export async function ActivityTab({ b }: { b: ProfileBase }) {
  if (b.hidden) return <Empty icon="shield" title="Activity is private">This collector's activity isn't shown publicly.</Empty>;
  const [{ events }, seasons] = await Promise.all([getActivity({ limit: 500 }), listSeasons()]);
  const seasonOf = new Map(seasons.map(s => [s.collectionName, s.id]));
  const names = new Map(b.allCards.map(c => [c.number, c.name]));
  const mine = events.filter(e => e.username === b.lower && (PUBLIC_ACTIVITY_TYPES as readonly string[]).includes(e.type) && (e.type !== 'trade' || e.action === 'accepted')).slice(0, 30);
  if (mine.length === 0) return <Empty icon="activity" title="No recent activity">Pulls, upgrades and trades appear here as they happen.</Empty>;
  const name = (n: number, fallback?: string) => fallback || names.get(n) || `Card #${n}`;
  const seasonFor = (collectionName?: string) => (collectionName && seasonOf.get(collectionName)) || (!collectionName ? b.season.id : '');
  return (
    <ul className="card rounded-2xl divide-y divide-gray-800/70 overflow-hidden">
      {mine.map(e => {
        let icon: Parameters<typeof Icon>[0]['name'] = 'activity'; let text: React.ReactNode = null;
        if (e.type === 'pull') {
          icon = 'cards';
          text = <>Pulled {activityCard(e, seasonFor(e.collectionName), name(e.cardNumber, e.cardName), VARIANT_LABELS[e.variant ?? 'regular'])}{e.isNew ? <span className="ml-1.5 text-[10px] font-extrabold uppercase tracking-wider text-green-300">new</span> : null}</>;
        } else if (e.type === 'upgrade') {
          icon = 'sparkles';
          text = <>Upgraded {activityCard(e, seasonFor(e.collectionName), name(e.cardNumber, e.cardName), VARIANT_LABELS[e.to])}</>;
        } else if (e.type === 'buff') {
          icon = 'zap';
          text = <>Used trainer card {activityCard(e, seasonFor(e.collectionName), name(e.cardNumber, e.cardName), 'Regular')} ({e.buffName})</>;
        } else if (e.type === 'trade') {
          icon = 'trade';
          const tradeHref = publicActivityHref(e, '');
          text = <>{tradeHref ? <Link href={tradeHref} className="text-yellow-300 hover:text-yellow-200">Traded</Link> : 'Traded'} with {e.partner ? <Link href={profileHref(e.partner)} className="text-yellow-300 hover:text-yellow-200">@{e.partner}</Link> : 'another collector'}</>;
        } else return null;
        return (
          <li key={e.seq} className="flex items-center gap-3 px-5 py-3 text-sm text-gray-300">
            <Icon name={icon} className="text-gray-500 shrink-0" /><span className="flex-1 min-w-0 truncate">{text}</span><span className="text-xs text-gray-600 shrink-0">{ago(e.at)}</span>
          </li>
        );
      })}
    </ul>
  );
}
