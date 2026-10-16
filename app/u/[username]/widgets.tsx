import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/app/components/Icon';
import { InfoTip } from '@/app/components/InfoTip';
import { CardTile } from '@/app/components/CardTile';
import { getActivity, type ActivityEvent } from '@/lib/activity';
import { getSeasonOverview } from '@/lib/site-data';
import { computeUserStats } from '@/lib/user-stats';
import { listOpenTrades, tradeHistory } from '@/lib/trades';
import { PUBLIC_ACTIVITY_TYPES, profileHref } from '@/lib/profile-url';
import { PROFILE_WIDGETS, type ProfileWidgetType } from '@/lib/profile-widgets';
import { getRarity } from '@/lib/rarity';
import { cardThumbUrl } from '@/lib/card-art';
import { VARIANT_LABELS } from '@/lib/variants';
import { topCopies, type ProfileBase } from '@/lib/profile-data';
import { bestPrintOf, rarestPrints } from '@/lib/collection-view';
import type { Copy } from '@/lib/serials-core';
import { syncAchievements, type AchievementsView } from '@/lib/achievements-store';
import { FlipCard } from '@/app/components/FlipCard';
import { ShareImageButton } from '@/app/components/ShareImage';
import { PinCopyButton } from '@/app/components/PinCopyButton';
import { loadCopyByUid } from '@/lib/copy-view';
import { getCopy, isTracking, mintedCounts } from '@/lib/serials';
import { pickRecentPulls, type PullFate } from '@/lib/recent-pulls-core';
import { copyHrefFor } from '@/lib/copy-link';
import { copyId as makeCopyId } from '@/lib/serials-core';
import { SerialChip } from '@/app/components/SerialChip';
import { entryOf } from '@/lib/serials-core';
import { serialMultiplier } from '@/lib/scoring-core';
import { engravedDate } from '@/lib/flip-back';
import { copyShareSpec } from '@/lib/copy-share';
import { getHoloResolver } from '@/lib/holo';
import { holoClass, holoVars } from '@/lib/holo-core';
import { SITE_URL } from '@/lib/site';

// The profile Overview's widgets (server components). Each returns its panel, or null for a visitor when there is nothing to show;
// the owner always gets a panel (an empty-state hint) so they can see and arrange every widget.

export interface WidgetCtx {
  b: ProfileBase;
  copies: Copy[];
  isOwner: boolean;
  viewer?: string;
  /** The signed-in viewer's copies per card number (when looking at someone else's profile). */
  mine?: Record<number, number>;
  events: ActivityEvent[];
  trades: { completed: number; listings: number };
  achievements?: AchievementsView;
}

const ago = (at: number) => {
  const m = Math.floor((Date.now() - at) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

function Box({ type, children, href, linkLabel }: { type: ProfileWidgetType; children: ReactNode; href?: string; linkLabel?: string }) {
  const def = PROFILE_WIDGETS[type];
  return (
    <section className="tcg-panel rounded-2xl p-5 h-full space-y-3" aria-label={def.title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-white"><Icon name={def.icon} className="mr-2 text-yellow-400" />{def.title}</h2>
        {href && <Link href={href} className="text-xs text-yellow-500 hover:text-yellow-300 whitespace-nowrap">{linkLabel ?? 'See all'} →</Link>}
      </div>
      {children}
    </section>
  );
}

const Hint = ({ children }: { children: ReactNode }) => <p className="text-sm text-gray-500">{children}</p>;

/** What the Overview needs loaded for these widgets (the costly reads only when a widget uses them). */
export async function loadWidgetData(types: ProfileWidgetType[], b: ProfileBase): Promise<Pick<WidgetCtx, 'events' | 'trades' | 'achievements'>> {
  const has = (t: ProfileWidgetType) => types.includes(t);
  const [events, open, history] = await Promise.all([
    (has('activity') || has('recent')) && !b.hidden ? getActivity({ limit: 500 }).then(r => r.events).catch(() => [] as ActivityEvent[]) : Promise.resolve([] as ActivityEvent[]),
    has('trades') ? listOpenTrades().catch(() => []) : Promise.resolve([]),
    has('trades') ? tradeHistory().catch(() => []) : Promise.resolve([]),
  ]);
  const achievements = has('achievements') ? await syncAchievements(b.lower).catch(() => undefined) : undefined;
  return {
    events,
    achievements,
    trades: {
      completed: history.filter(t => t.status === 'accepted' && (t.from === b.lower || t.to === b.lower || t.resolvedBy === b.lower)).length,
      listings: open.filter(t => t.kind === 'listing' && t.from === b.lower && t.seasonId === b.season.id).length,
    },
  };
}

export async function renderProfileWidget(type: ProfileWidgetType, ctx: WidgetCtx): Promise<ReactNode> {
  const { b, isOwner } = ctx;
  const none = (msg: ReactNode) => (isOwner ? <Box type={type}><Hint>{msg}</Hint></Box> : null);

  switch (type) {
    case 'stats': {
      const overview = await getSeasonOverview(b.season);
      const s = computeUserStats(overview, b.lower, b.owned, b.collection, { upgrades: false });
      if (s.copies === 0) return none('Pull a card to start scoring.');
      return (
        <Box type={type} href={`/leaderboard/${b.season.id}`} linkLabel="Leaderboard">
          <dl className="text-sm divide-y divide-gray-800/70">
            <div className="flex justify-between py-1.5"><dt className="text-gray-400">Cards</dt><dd className="tabular-nums text-white">{Math.round(s.cardPoints - s.serialPoints).toLocaleString()}</dd></div>
            <div className="flex justify-between py-1.5"><dt className="text-gray-400">Edition bonus<InfoTip term="editionBonus" /></dt><dd className="tabular-nums text-emerald-300">{s.serialPoints > 0 ? `+${Math.round(s.serialPoints).toLocaleString()}` : '-'}</dd></div>
            <div className="flex justify-between py-1.5"><dt className="text-gray-400">Progress bonus<InfoTip term="progressBonus" /></dt><dd className="tabular-nums text-emerald-300">+{Math.round(s.completionBonus).toLocaleString()}</dd></div>
            <div className="flex justify-between py-1.5"><dt className="text-gray-400">Full set bonus<InfoTip term="fullSetBonus" /></dt><dd className="tabular-nums text-emerald-300">{s.complete ? `+${Math.round(s.setBonus).toLocaleString()}` : '-'}</dd></div>
            <div className="flex justify-between py-1.5 font-bold"><dt className="text-white">Total</dt><dd className="tabular-nums text-yellow-300">{Math.round(s.score).toLocaleString()}</dd></div>
          </dl>
          <p className="text-xs text-gray-500">{s.copies} print{s.copies === 1 ? '' : 's'} · {s.uniqueCards}/{s.totalCards} different cards</p>
        </Box>
      );
    }

    case 'showcase': {
      const top = topCopies(b.allCards, b.variantMap, b.board.values.cards, 3, { held: b.board.values.serials?.held.get(b.lower), settings: b.board.values.settings });
      if (top.length === 0) return none('Your three most valuable cards appear here once you have some.');
      return (
        <Box type={type}>
          <ul className="flex flex-wrap gap-4">
            {top.map(c => {
              // The print that earned the place: their best edition of it (untracked seasons have no prints, so the tile opens the dex).
              const print = bestPrintOf(ctx.copies.filter(x => x.owner === b.lower), c.number, c.variant);
              const href = print?.uid ? `/c/${print.uid}` : print ? `/copy/${encodeURIComponent(b.season.id)}/${print.id}` : `/cards?card=${c.number}`;
              return (
                <li key={c.number} className="w-24 sm:w-28">
                  <Link href={href} title={`${c.name}${c.variant === 'regular' ? '' : ` (${VARIANT_LABELS[c.variant]})`}`}>
                    <CardTile imageUrl={(c.variant === 'full' || c.variant === 'shiny') && c.fullArtImageUrl ? c.fullArtImageUrl : c.imageUrl} alt={c.name} className="relative aspect-[2/3] rounded-lg overflow-hidden border-2" style={{ borderColor: getRarity(c.stars)?.hex }} />
                  </Link>
                  <p className="mt-1 text-xs text-gray-200 truncate">{c.name}</p>
                  <p className="text-[11px] text-yellow-400 tabular-nums">{Math.round(c.points).toLocaleString()} pts{c.variant !== 'regular' ? ` · ${VARIANT_LABELS[c.variant]}` : ''}</p>
                  {print && <p className="text-[11px] text-gray-500 tabular-nums truncate">{print.uid ? `Print #${print.uid}` : `Edition #${print.n}`}</p>}
                </li>
              );
            })}
          </ul>
        </Box>
      );
    }

    case 'pinned': {
      const uid = b.settings.pinned;
      if (!uid) return none('Open one of your prints and press “Pin to my profile” to show it here.');
      const found = await loadCopyByUid(uid).catch(() => null);
      // Only the holder's own copy is shown: a copy that was traded away stops being their showcase.
      if (!found || found.copy.owner !== b.lower) return none('The pinned print is not in your collection any more. Pin another from its page.');
      const { season, copy, pack, card } = found;
      const [minted, holoFor] = await Promise.all([mintedCounts(season.collectionName), getHoloResolver()]);
      const total = minted.get(entryOf(copy)) ?? copy.n;
      const mult = serialMultiplier(copy.n, b.board.values.settings);
      const art = (copy.variant === 'full' || copy.variant === 'shiny') && card.fullArtImageUrl ? card.fullArtImageUrl : card.imageUrl;
      const rarity = getRarity(card.stars);
      const holo = holoFor(pack, card.stars)[copy.variant];
      const label = `${copy.variant === 'regular' ? '' : `${VARIANT_LABELS[copy.variant]} `}${card.name}`;
      return (
        <Box type={type}>
          <div className="mx-auto w-full max-w-[220px]">
            <FlipCard
              back={{
                n: copy.n, uid: copy.uid, total, variantLabel: VARIANT_LABELS[copy.variant], name: card.name, date: engravedDate(copy.at), est: copy.est,
                bonus: mult > 1 ? Math.round(mult * 100) / 100 : undefined, hex: rarity?.hex, holder: `@${b.lower}`,
                href: `/copy/${encodeURIComponent(season.id)}/${copy.id}`, qrUrl: `${SITE_URL}/copy/${encodeURIComponent(season.id)}/${copy.id}`,
              }}
            >
              <CardTile
                imageUrl={art}
                alt={label}
                className={`relative aspect-[2/3] rounded-xl overflow-hidden border-2 ${copy.variant !== 'regular' ? `vfx-${copy.variant}` : ''} ${holoClass(holo, true)}`}
                style={{ borderColor: rarity?.hex, boxShadow: `0 0 24px -6px ${rarity?.hex}`, ...holoVars(holo) }}
              />
            </FlipCard>
          </div>
          <div className="text-center space-y-1">
            <p className="font-bold text-white leading-tight">{label}</p>
            <p className="text-sm text-yellow-300 tabular-nums">#{copy.uid ?? copy.n}<span className="text-gray-500"> · edition #{copy.n} of {total.toLocaleString()}</span></p>
            <p className="text-xs">
              <Link href={`/copy/${encodeURIComponent(season.id)}/${copy.id}`} className="text-yellow-500 hover:text-yellow-300">Full journey →</Link>
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <ShareImageButton
              spec={copyShareSpec({ copy, cardName: card.name, seasonId: season.id, seasonName: season.name, packName: pack.name, total, mult, art, hex: rarity?.hex, privateHolder: false, siteUrl: SITE_URL })}
              filename={`cheesy-tcg-${copy.uid ?? copy.id}.png`}
              label="Share this print"
            />
            {isOwner && <PinCopyButton uid={copy.uid!} pinned label="Pin" />}
          </div>
        </Box>
      );
    }

    case 'rarity':
      return (
        <Box type={type} href={profileHref(b.lower, 'collection')} linkLabel="Collection">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(7rem,1fr))]">
            {b.rarity.map(r => (
              <div key={r.stars} className="rounded-xl bg-gray-950/50 border border-gray-800 p-3 text-center">
                <p className="text-xs font-medium mb-1" style={{ color: r.hex }}>{'★'.repeat(r.stars)}</p>
                <p className="text-lg font-bold text-white tabular-nums">{r.owned}/{r.total}</p>
                <p className="text-xs text-gray-600">{r.label}</p>
              </div>
            ))}
          </div>
        </Box>
      );

    case 'progress': {
      const rows = b.packs.map(p => ({ name: p.pack.name, total: p.cards.length, owned: p.cards.filter(c => b.countMap.has(c.number)).length })).filter(r => r.total > 0);
      if (rows.length === 0) return none('No packs in this season yet.');
      return (
        <Box type={type}>
          <ul className="space-y-3">
            {rows.map(r => (
              <li key={r.name} className="space-y-1">
                <div className="flex justify-between text-sm"><span className="text-gray-300 truncate">{r.name}</span><span className="tabular-nums text-gray-400">{r.owned}/{r.total}</span></div>
                <div className="h-2 rounded-full bg-gray-950 border border-gray-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-yellow-600" style={{ width: `${Math.round((r.owned / r.total) * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        </Box>
      );
    }

    case 'rarest': {
      const held = ctx.copies.filter(x => x.owner === b.lower);
      if (held.length > 0) {
        // Prints, not cards: the chance of that card in that version (card pull chance x the version's share of the pack's roll weights).
        const byNumber = new Map(b.allCards.map(card => [card.number, card]));
        const chanceOf = (card: number, variant: Copy['variant']) => {
          const cv = b.board.values.cards.get(card);
          if (!cv) return 0;
          const w = cv.maths.weights;
          const total = w.regular + w.reverse + w.full + w.shiny;
          return total > 0 ? cv.pullRate * (w[variant] / total) : 0;
        };
        const rows = rarestPrints(held, chanceOf, 5).filter(p => byNumber.has(p.card));
        if (rows.length > 0) {
          const holoFor = await getHoloResolver();
          return (
            <Box type={type}>
              <ul className="divide-y divide-gray-800/70">
                {rows.map(p => {
                  const c = byNumber.get(p.card)!;
                  const rarity = getRarity(c.stars);
                  const holo = holoFor(c.pack, c.stars)[p.variant];
                  const art = (p.variant === 'full' || p.variant === 'shiny') && c.fullArtImageUrl ? c.fullArtImageUrl : c.imageUrl;
                  return (
                    <li key={p.id}>
                      <Link href={p.uid ? `/c/${p.uid}` : `/copy/${encodeURIComponent(b.season.id)}/${p.id}`} className="flex items-center gap-3 py-2 hover:text-white text-gray-300">
                        <span className={`w-8 h-11 rounded overflow-hidden bg-gray-800 shrink-0 ${p.variant !== 'regular' ? `vfx-${p.variant}` : ''} ${holoClass(holo, true)}`} style={holoVars(holo)}><CardTile imageUrl={art} alt="" className="relative w-full h-full" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-white truncate">{p.variant !== 'regular' && <span className="text-fuchsia-300 mr-1">{VARIANT_LABELS[p.variant]}</span>}{c.name}</span>
                          <span className="block text-xs text-gray-500 tabular-nums truncate"><span style={{ color: rarity?.hex }}>{'★'.repeat(c.stars)}</span> {p.uid ? `Print #${p.uid}` : 'Print'}</span>
                        </span>
                        <SerialChip n={p.n} est={p.est} />
                        <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">1 in {Math.round(1 / p.chance).toLocaleString()}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Box>
          );
        }
      }
      // Prints are not tracked for this season: the card-level list.
      const owned = b.allCards.filter(c => b.countMap.has(c.number))
        .map(c => ({ c, rate: b.board.values.cards.get(c.number)?.pullRate ?? 1 }))
        .sort((x, y) => x.rate - y.rate || y.c.stars - x.c.stars).slice(0, 5);
      if (owned.length === 0) return none('Your rarest prints appear here.');
      return (
        <Box type={type}>
          <ul className="divide-y divide-gray-800/70">
            {owned.map(({ c, rate }) => (
              <li key={c.number} className="flex items-center gap-3 py-2">
                <span className="w-8 h-11 rounded overflow-hidden bg-gray-800 shrink-0"><CardTile imageUrl={c.imageUrl} alt="" className="relative w-full h-full" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm text-white truncate">{c.name}</span><span className="block text-xs" style={{ color: getRarity(c.stars)?.hex }}>{'★'.repeat(c.stars)} {getRarity(c.stars)?.label}</span></span>
                <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">{rate > 0 ? `1 in ${Math.round(1 / rate).toLocaleString()}` : ''}</span>
              </li>
            ))}
          </ul>
        </Box>
      );
    }

    case 'recent': {
      const c = b.season.collectionName;
      const tracked = await isTracking(c);
      const FATE: Record<PullFate, string> = { held: '', offer: 'in a trade offer', traded: 'traded', forged: 'upgraded', removed: 'removed' };
      const names = new Map(b.allCards.map(card => [card.number, card.name]));
      const mine = ctx.events.filter((e): e is Extract<ActivityEvent, { type: 'pull' | 'grant' }> => (e.type === 'pull' || e.type === 'grant') && e.username === b.lower && e.collectionName === c);
      if (tracked) {
        // The prints they hold now plus the ones their pull events name (a pull later traded away or upgraded is no longer in their hands).
        const ids = [...new Set(mine.map(e => e.copyId ?? (e.type === 'pull' && e.serial ? makeCopyId(e.cardNumber, e.variant ?? 'regular', e.serial) : '')).filter(Boolean))].slice(0, 24);
        const gone = (await Promise.all(ids.map(id => getCopy(c, id).catch(() => null)))).filter((x): x is Copy => !!x);
        const latest = pickRecentPulls([...ctx.copies, ...gone], b.lower, 8);
        if (latest.length > 0) {
          return (
            <Box type={type}>
              <ul className="divide-y divide-gray-800/70">
                {latest.map(p => (
                  <li key={p.id}>
                    <Link href={copyHrefFor({ type: 'pull', uid: p.uid, serial: p.n, variant: p.variant, cardNumber: p.card }, b.season.id) ?? `/copy/${encodeURIComponent(b.season.id)}/${p.id}`} className="flex items-center gap-2 py-2 text-sm hover:text-white text-gray-300">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{p.variant !== 'regular' && <span className="text-fuchsia-300 mr-1">{VARIANT_LABELS[p.variant]}</span>}{names.get(p.card) ?? `Card #${p.card}`}</span>
                        <span className="block text-xs text-gray-500 tabular-nums truncate">{p.uid ? `Print #${p.uid}` : 'Print'}{p.origin === 'grant' && p.fate === 'held' ? ' · Granted' : FATE[p.fate] ? ` · ${p.origin === 'grant' ? 'Granted, ' : ''}${FATE[p.fate]}` : ''}</span>
                      </span>
                      <SerialChip n={p.n} est={p.est} />
                      <span className="text-xs text-gray-600 tabular-nums whitespace-nowrap w-14 text-right">{ago(p.at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Box>
          );
        }
      }
      // Before prints are tracked (or nothing pulled yet): the owner sees their pull events, which carry no print numbers.
      if (!isOwner || mine.length === 0) return none('Your latest pulls appear here as you open packs.');
      return (
        <Box type={type}>
          <ul className="divide-y divide-gray-800/70">
            {mine.slice(0, 8).map(e => (
              <li key={e.seq} className="flex items-center gap-2 py-2 text-sm text-gray-300">
                <span className="flex-1 min-w-0 truncate">{e.variant && e.variant !== 'regular' && <span className="text-fuchsia-300 mr-1">{VARIANT_LABELS[e.variant]}</span>}{(e.type === 'pull' ? e.cardName : '') || names.get(e.cardNumber) || `Card #${e.cardNumber}`}</span>
                <span className="text-xs text-gray-600 shrink-0">{ago(e.at)}</span>
              </li>
            ))}
          </ul>
        </Box>
      );
    }

    case 'activity': {
      if (b.hidden) return none('Activity is private for private profiles.');
      const names = new Map(b.allCards.map(c => [c.number, c.name]));
      const mine = ctx.events.filter(e => e.username === b.lower && (PUBLIC_ACTIVITY_TYPES as readonly string[]).includes(e.type) && (e.type !== 'trade' || e.action === 'accepted')).slice(0, 6);
      if (mine.length === 0) return none('Pulls, upgrades and trades appear here as they happen.');
      const name = (n: number, fb?: string) => fb || names.get(n) || `Card #${n}`;
      return (
        <Box type={type} href={profileHref(b.lower, 'activity')}>
          <ul className="divide-y divide-gray-800/70">
            {mine.map(e => (
              <li key={e.seq} className="flex items-center gap-2 py-2 text-sm text-gray-300">
                <span className="flex-1 min-w-0 truncate">
                  {e.type === 'pull' && <>Pulled <strong className="text-white">{name(e.cardNumber, e.cardName)}</strong>{e.variant && e.variant !== 'regular' ? <span className="text-purple-300"> ({VARIANT_LABELS[e.variant]})</span> : null}</>}
                  {e.type === 'upgrade' && <>Upgraded <strong className="text-white">{name(e.cardNumber, e.cardName)}</strong> to <span className="text-purple-300">{VARIANT_LABELS[e.to]}</span></>}
                  {e.type === 'trade' && <>Traded with {e.partner ? `@${e.partner}` : 'another collector'}</>}
                </span>
                <span className="text-xs text-gray-600 shrink-0">{ago(e.at)}</span>
              </li>
            ))}
          </ul>
        </Box>
      );
    }

    case 'trades':
      return (
        <Box type={type} href={profileHref(b.lower, 'trades')}>
          <p className="text-sm text-gray-300"><strong className="text-white tabular-nums">{ctx.trades.completed}</strong> completed trade{ctx.trades.completed === 1 ? '' : 's'} in the recent history · <strong className="text-white tabular-nums">{ctx.trades.listings}</strong> open listing{ctx.trades.listings === 1 ? '' : 's'} on the board.</p>
          {ctx.viewer && ctx.viewer !== b.lower && <Link href={`/trade/new?to=${encodeURIComponent(b.lower)}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-200 bg-purple-500/10 border border-purple-400/40 hover:bg-purple-500/20 rounded-full px-3 py-1.5"><Icon name="trade" />Offer {b.displayName} a trade</Link>}
        </Box>
      );

    case 'achievements': {
      const a = ctx.achievements;
      if (!a || (a.earned.length === 0 && a.next.length === 0)) return none('Collection goals, like completing a season or owning every card of a rarity, show up here as you get close.');
      return (
        <Box type={type}>
          {a.earned.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Earned achievements">
              {a.earned.map(x => (
                <li key={x.id} title={x.detail} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${x.seasonId === 'special' ? 'border-purple-400/50 bg-gradient-to-r from-yellow-500/10 to-purple-500/15' : 'border-yellow-500/30 bg-yellow-500/[0.06]'}`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${x.seasonId === 'special' ? 'bg-purple-500/20 text-purple-200' : 'bg-yellow-500/15 text-yellow-300'}`}><Icon name={x.icon} /></span>
                  <span className="min-w-0 text-sm">
                    <span className="block font-semibold text-white truncate">{x.title}</span>
                    <span className="block text-[11px] text-gray-500 truncate">{x.seasonName} · {new Date(x.earnedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {a.next.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-500">{a.earned.length > 0 ? 'Next up' : 'In progress'}</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {a.next.slice(0, 4).map(x => (
                  <li key={x.id} className="space-y-1">
                    <div className="flex justify-between text-sm"><span className="text-gray-300 truncate">{x.title}</span><span className="tabular-nums text-gray-500">{x.have}/{x.need}</span></div>
                    <div className="h-1.5 rounded-full bg-gray-950 border border-gray-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-yellow-600" style={{ width: `${Math.round((x.have / x.need) * 100)}%` }} /></div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Box>
      );
    }

    case 'awards': {
      if (b.awards.length === 0) return none('Season awards you earn show up here.');
      return (
        <Box type={type}>
          <ul className="flex flex-wrap gap-1.5">
            {b.awards.map((a, i) => (
              <li key={`${a.seasonId}-${a.award.id}-${i}`}>
                <Link href={`/leaderboard/${a.seasonId}`} title={`${a.award.title} · ${a.seasonName} · ${a.award.detail}`} className="inline-flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-0.5 text-[11px] font-bold text-yellow-300 hover:bg-yellow-500/20">
                  <Icon name={a.award.icon} className="w-3 h-3" />{a.award.title}<span className="text-yellow-500/70 font-semibold">· {b.season.id === a.seasonId ? 'this season' : a.seasonName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Box>
      );
    }

    case 'wishlist': {
      const wanted = b.settings.wanted.map(n => b.allCards.find(c => c.number === n)).filter((c): c is NonNullable<typeof c> => !!c);
      if (wanted.length === 0) return none(<>List the cards you want in <Link href="/settings#looking-for" className="text-yellow-400 hover:text-yellow-300">Settings</Link>.</>);
      return (
        <Box type={type}>
          <ul className="flex flex-wrap gap-2">
            {wanted.map(c => {
              const have = (b.countMap.get(c.number) ?? 0) > 0;
              const theirs = ctx.mine?.[c.number] ?? 0;
              return (
                <li key={c.number} className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 text-xs ${have ? 'border-gray-800 text-gray-500' : 'border-yellow-500/30 bg-yellow-500/5 text-gray-200'}`}>
                  <span className="font-bold">{c.name}</span>
                  {have && <span className="text-emerald-400">got it</span>}
                  {ctx.viewer && !ctx.isOwner && theirs > 0 && !have && <Link href={`/trade/new?to=${encodeURIComponent(b.lower)}`} className="rounded-full bg-purple-500/20 border border-purple-400/40 px-2 py-0.5 font-bold text-purple-200 hover:bg-purple-500/30">You have {theirs} · offer a trade</Link>}
                </li>
              );
            })}
          </ul>
        </Box>
      );
    }

    case 'collection': {
      const owned = b.allCards.filter(c => b.countMap.has(c.number));
      if (owned.length === 0) return none('Your cards appear here.');
      return (
        <Box type={type} href={profileHref(b.lower, 'collection')} linkLabel={`All ${owned.length} cards`}>
          <ul className="flex gap-2 overflow-hidden">
            {owned.slice(0, 14).map(c => (
              <li key={c.number} className="w-14 shrink-0">
                <Link href={profileHref(b.lower, 'collection')} title={c.name}><img src={cardThumbUrl(c.imageUrl)} alt={c.name} loading="lazy" className="aspect-[2/3] w-full rounded-md border-2 object-cover" style={{ borderColor: getRarity(c.stars)?.hex }} /></Link>
              </li>
            ))}
          </ul>
        </Box>
      );
    }
  }
}
