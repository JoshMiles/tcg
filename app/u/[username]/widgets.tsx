import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/app/components/Icon';
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
import type { Copy } from '@/lib/serials-core';

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
export async function loadWidgetData(types: ProfileWidgetType[], b: ProfileBase): Promise<Pick<WidgetCtx, 'events' | 'trades'>> {
  const has = (t: ProfileWidgetType) => types.includes(t);
  const [events, open, history] = await Promise.all([
    has('activity') && !b.hidden ? getActivity({ limit: 500 }).then(r => r.events).catch(() => [] as ActivityEvent[]) : Promise.resolve([] as ActivityEvent[]),
    has('trades') ? listOpenTrades().catch(() => []) : Promise.resolve([]),
    has('trades') ? tradeHistory().catch(() => []) : Promise.resolve([]),
  ]);
  return {
    events,
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
            <div className="flex justify-between py-1.5"><dt className="text-gray-400">Serial number bonus</dt><dd className="tabular-nums text-emerald-300">{s.serialPoints > 0 ? `+${Math.round(s.serialPoints).toLocaleString()}` : '—'}</dd></div>
            <div className="flex justify-between py-1.5"><dt className="text-gray-400">Completion bonus</dt><dd className="tabular-nums text-emerald-300">+{Math.round(s.completionBonus).toLocaleString()}</dd></div>
            <div className="flex justify-between py-1.5"><dt className="text-gray-400">Complete set bonus</dt><dd className="tabular-nums text-emerald-300">{s.complete ? `+${Math.round(s.setBonus).toLocaleString()}` : '—'}</dd></div>
            <div className="flex justify-between py-1.5 font-bold"><dt className="text-white">Total</dt><dd className="tabular-nums text-yellow-300">{Math.round(s.score).toLocaleString()}</dd></div>
          </dl>
          <p className="text-xs text-gray-500">{s.copies} cop{s.copies === 1 ? 'y' : 'ies'} · {s.uniqueCards}/{s.totalCards} different cards</p>
        </Box>
      );
    }

    case 'showcase': {
      const top = topCopies(b.allCards, b.variantMap, b.board.values.cards, 3, { held: b.board.values.serials?.held.get(b.lower), settings: b.board.values.settings });
      if (top.length === 0) return none('Your three most valuable cards appear here once you have some.');
      return (
        <Box type={type}>
          <ul className="flex flex-wrap gap-4">
            {top.map(c => (
              <li key={c.number} className="w-24 sm:w-28">
                <Link href={`/cards?card=${c.number}`} title={`${c.name}${c.variant === 'regular' ? '' : ` (${VARIANT_LABELS[c.variant]})`}`}>
                  <CardTile imageUrl={(c.variant === 'full' || c.variant === 'shiny') && c.fullArtImageUrl ? c.fullArtImageUrl : c.imageUrl} alt={c.name} className="relative aspect-[2/3] rounded-lg overflow-hidden border-2" style={{ borderColor: getRarity(c.stars)?.hex }} />
                </Link>
                <p className="mt-1 text-xs text-gray-200 truncate">{c.name}</p>
                <p className="text-[11px] text-yellow-400 tabular-nums">{Math.round(c.points).toLocaleString()} pts{c.variant !== 'regular' ? ` · ${VARIANT_LABELS[c.variant]}` : ''}</p>
              </li>
            ))}
          </ul>
        </Box>
      );
    }

    case 'rarity':
      return (
        <Box type={type} href={profileHref(b.lower, 'collection')} linkLabel="Collection">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
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
      const owned = b.allCards.filter(c => b.countMap.has(c.number))
        .map(c => ({ c, rate: b.board.values.cards.get(c.number)?.pullRate ?? 1 }))
        .sort((x, y) => x.rate - y.rate || y.c.stars - x.c.stars).slice(0, 5);
      if (owned.length === 0) return none('Your rarest cards appear here.');
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
      const latest = [...ctx.copies].sort((x, y) => y.at - x.at || y.n - x.n).slice(0, 6);
      if (latest.length === 0) return none('Numbered copies show up here once card serials are being tracked.');
      const names = new Map(b.allCards.map(c => [c.number, c.name]));
      return (
        <Box type={type}>
          <ul className="divide-y divide-gray-800/70">
            {latest.map(c => (
              <li key={c.id}>
                <Link href={`/copy/${encodeURIComponent(b.season.id)}/${c.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-white text-gray-300">
                  <span className="truncate">{c.variant !== 'regular' && <span className="text-fuchsia-300 mr-1">{VARIANT_LABELS[c.variant]}</span>}{names.get(c.card) ?? `Card #${c.card}`}</span>
                  <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap"><span className="text-yellow-300 font-bold">#{c.n}</span>{c.est ? '~' : ''} · {ago(c.at)}</span>
                </Link>
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
