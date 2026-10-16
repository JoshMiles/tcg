import { Icon } from '@/app/components/Icon';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession, loginConfigured } from '@/lib/session';
import { getCollection } from '@/lib/kv';
import { getActive } from '@/lib/site-seasons';
import { getTradeSettings, sweepTrades, tradesForUser, listOpenTrades } from '@/lib/trades';
import { describeItems, firstMissing } from '@/lib/trade-core';
import { getTradeCards, getTradePools } from '@/lib/trade-view';
import { TradeCard } from '@/app/components/trade/TradeCard';
import { TradeActions } from '@/app/components/trade/TradeActions';
import { getUserSettings } from '@/lib/user-settings-store';
import { bestMatches, matchTrade, type MatchViewer } from '@/lib/trade-match';
import { profileHref } from '@/lib/profile-url';
import { BoardToolbar } from './BoardToolbar';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Trade', description: 'Swap cards with other collectors.', robots: { index: false, follow: true } };

const user = (name: string) => (
  <Link href={profileHref(name)} className="text-yellow-300 hover:text-yellow-200 font-bold">@{name}</Link>
);

type TabId = 'mine' | 'board' | 'history';

export default async function TradePage({ searchParams }: { searchParams: Promise<{ season?: string; tab?: string }> }) {
  const { season: seasonParam, tab: tabParam } = await searchParams;
  const [session, { season, seasons }, settings] = await Promise.all([getSession(), getActive(seasonParam), getTradeSettings()]);
  await sweepTrades(); // refund anything that has run out of time before showing it

  if (!season) {
    return <div className="max-w-5xl mx-auto px-4 py-10"><p className="rind rounded-2xl p-8 text-center text-gray-400">No season is running right now, so there is nothing to trade yet.</p></div>;
  }

  const cards = await getTradeCards(season);
  const me = session?.username;
  const mine = me ? await tradesForUser(me) : null;
  const owned = me ? (await getCollection(season.collectionName))[me] ?? [] : [];
  const prefs = me ? await getUserSettings(me) : null;
  const here = <T extends { seasonId: string }>(list: T[]) => list.filter(t => t.seasonId === season.id);
  const board = here((await listOpenTrades()).filter(t => t.kind === 'listing' && t.from !== me));
  const incoming = mine ? here(mine.incoming) : [];
  const outgoing = mine ? here(mine.outgoing) : [];
  const recent = mine ? here(mine.recent) : [];
  const nameOf = (n: number) => cards[n]?.name;

  // How each listing suits the viewer: used for the matches panel and the board's filters.
  const copies = new Map<number, number>();
  for (const e of owned) copies.set(e, (copies.get(e) ?? 0) + 1);
  const viewer: MatchViewer = { copies, wanted: new Set([...(prefs?.wanted ?? []), ...(prefs?.watches ?? []).map(w => w.card)]) };
  const pools = await getTradePools(season, [...board, ...incoming, ...outgoing, ...recent], me);
  const infoFor = new Map(board.map(t => [t.id, matchTrade(t, viewer, cards, pools)]));
  const matches = me ? bestMatches(board, viewer, cards, 4, pools) : [];

  const tab: TabId = (['mine', 'board', 'history'] as const).find(t => t === tabParam) ?? (me && (incoming.length > 0 || outgoing.length > 0) ? 'mine' : 'board');
  const tabs: { id: TabId; label: string; icon: Parameters<typeof Icon>[0]['name']; count?: number; hidden?: boolean }[] = [
    { id: 'mine', label: 'Your trades', icon: 'inbox', count: incoming.length + outgoing.length, hidden: !me },
    { id: 'board', label: 'The board', icon: 'board', count: board.length },
    { id: 'history', label: 'History', icon: 'history', hidden: !me },
  ];
  const href = (id: TabId) => `/trade?tab=${id}${seasonParam ? `&season=${encodeURIComponent(seasonParam)}` : ''}`;

  const section = 'space-y-3';
  const heading = 'font-display text-xl font-bold text-white flex items-center gap-2';

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl font-bold text-white"><Icon name="trade" className="mr-2 text-yellow-400" />Trade</h1>
            <p className="text-sm text-gray-400 mt-1 max-w-2xl">
              Swap cards with other collectors: offer to one person, or post on the open board for anyone to take.
              Cards you offer are <strong className="text-gray-300">held safely in escrow</strong> and come straight back if the offer is declined, cancelled or runs out
              (offers last {settings.expiryHours}h).
            </p>
          </div>
          {session
            ? <Link href="/trade/new" className="tcg-btn px-5 py-2.5 rounded-xl text-sm">+ New offer</Link>
            : loginConfigured() && <Link href="/auth/twitch?returnTo=/trade" className="tcg-btn px-5 py-2.5 rounded-xl text-sm">Log in with Twitch to trade</Link>}
        </div>
        {seasons.length > 1 && (
          <p className="text-xs text-gray-500">
            Season:{' '}
            {seasons.map(s => (
              <Link key={s.id} href={`/trade?season=${s.id}`} className={`mr-2 ${s.id === season.id ? 'text-yellow-300 font-bold' : 'hover:text-white'}`}>{s.name}</Link>
            ))}
          </p>
        )}
        {season.tradingFrozen && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
            Trading is closed for {season.name}. Open offers can still be cancelled to get your cards back.
          </p>
        )}
        {!settings.enabled && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
            Trading is paused right now. You can still cancel your own offers to get your cards back, but nothing can be accepted until it is switched back on.
          </p>
        )}
      </header>

      <nav aria-label="Trade sections" className="no-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-800 -mx-1 px-1">
        {tabs.filter(t => !t.hidden).map(t => (
          <Link key={t.id} href={href(t.id)} scroll={false} aria-current={t.id === tab ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${t.id === tab ? 'border-yellow-500 text-yellow-300' : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'}`}>
            <Icon name={t.icon} />{t.label}
            {t.count ? <span className={`text-[11px] tabular-nums rounded-full px-1.5 py-px ${t.id === tab ? 'bg-yellow-500/15 text-yellow-300' : 'bg-gray-800 text-gray-400'}`}>{t.count}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === 'mine' && session && (
        <div className="space-y-8">
          {incoming.length === 0 && outgoing.length === 0 && (
            <p className="rind rounded-2xl p-8 text-center text-sm text-gray-400">You have no open offers. <Link href="/trade/new" className="text-yellow-400 hover:text-yellow-300">Make one</Link> or take a look at <Link href={href('board')} className="text-yellow-400 hover:text-yellow-300">the board</Link>.</p>
          )}

          {incoming.length > 0 && (
            <section className={section}>
              <h2 className={heading}><Icon name="inbox" className="mr-2" />Offers for you <span className="text-sm font-normal text-gray-500">({incoming.length})</span></h2>
              {incoming.map(t => {
                const lack = firstMissing(owned, t.get);
                return (
                  <TradeCard
                    key={t.id}
                    trade={t}
                    pools={pools}
                    cards={cards}
                    title={<>{user(t.from)} offered you a trade</>}
                    actions={<TradeActions tradeId={t.id} mode="incoming" canAccept={!lack && settings.enabled} blocked={lack ? `You need ${describeItems([lack], nameOf)}` : undefined} />}
                  />
                );
              })}
            </section>
          )}

          {outgoing.length > 0 && (
            <section className={section}>
              <h2 className={heading}><Icon name="send" className="mr-2" />Your open offers <span className="text-sm font-normal text-gray-500">({outgoing.length}/{settings.maxOpenPerUser})</span></h2>
              {outgoing.map(t => (
                <TradeCard
                  key={t.id}
                  trade={t}
                  pools={pools}
                  cards={cards}
                  title={t.kind === 'direct' ? <>You offered {user(t.to!)} a trade</> : <>Your listing on the board</>}
                  actions={<TradeActions tradeId={t.id} mode="outgoing" />}
                />
              ))}
              <p className="text-xs text-gray-500">The cards you offered are in escrow while an offer is open. Cancelling returns them straight away.</p>
            </section>
          )}

          {matches.length > 0 && (
            <section className={section} aria-label="Matches for you">
              <h2 className={heading}><Icon name="zap" className="mr-2 text-yellow-400" />Matches for you</h2>
              <p className="text-xs text-gray-500 -mt-1">Listings on the board that give a card you are looking for or do not have yet, or only ask for your spares.</p>
              {matches.map(m => (
                <TradeCard
                  key={m.trade.id}
                  trade={m.trade}
                  href={`/trade/${m.trade.id}`}
                  pools={pools}
                  cards={cards}
                  title={<>{user(m.trade.from)}&rsquo;s listing <span className="ml-2 text-xs font-normal text-emerald-300">{m.reasons.join(' · ')}</span></>}
                  actions={<TradeActions tradeId={m.trade.id} mode="board" canAccept={settings.enabled} />}
                />
              ))}
            </section>
          )}
        </div>
      )}

      {tab === 'board' && (
        <section className={section}>
          <h2 className={heading}><Icon name="board" className="mr-2" />The board <span className="text-sm font-normal text-gray-500">({board.length})</span></h2>
          {board.length === 0 ? (
            <p className="rind rounded-2xl p-6 text-center text-sm text-gray-400">{session ? 'Nothing on the board right now. Post a listing and let others come to you.' : 'Nothing on the board right now. Log in with Twitch to post a listing, or check back soon.'}</p>
          ) : (
            <>
              <BoardToolbar total={board.length} signedIn={!!session} />
              <div className="flex flex-col gap-3">
                {board.map(t => {
                  const lack = firstMissing(owned, t.get);
                  const m = infoFor.get(t.id)!;
                  const search = [t.from, ...t.give.map(i => nameOf(i.cardNumber) ?? ''), ...t.get.map(i => nameOf(i.cardNumber) ?? '')].join(' ').toLowerCase();
                  return (
                    <div
                      key={t.id}
                      data-board
                      data-search={search}
                      data-take={session && m.canTake ? '1' : '0'}
                      data-wanted={m.offersWanted.length > 0 ? '1' : '0'}
                      data-new={m.offersNew.length > 0 ? '1' : '0'}
                      data-spare={m.asksOnlySpares ? '1' : '0'}
                      data-gain={m.gain}
                      data-created={t.createdAt}
                      data-expires={t.expiresAt}
                    >
                      <TradeCard
                        trade={t}
                        href={`/trade/${t.id}`}
                        pools={pools}
                        cards={cards}
                        title={<>{user(t.from)}&rsquo;s listing{session && m.reasons.length > 0 && <span className="ml-2 text-xs font-normal text-emerald-300">{m.reasons[0]}</span>}</>}
                        actions={session
                          ? <TradeActions tradeId={t.id} mode="board" canAccept={!lack && settings.enabled} blocked={lack ? `You need ${describeItems([lack], nameOf)}` : undefined} />
                          : <span className="text-xs text-gray-500">Log in to take a trade</span>}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'history' && session && (
        <section className={section}>
          <h2 className={heading}><Icon name="history" className="mr-2" />History</h2>
          {recent.length === 0 ? (
            <p className="rind rounded-2xl p-6 text-center text-sm text-gray-400">No finished trades yet.</p>
          ) : recent.map(t => (
            <TradeCard
              key={t.id}
              trade={t}
              pools={pools}
              cards={cards}
              compact
              title={<>{user(t.from)}{t.to ? <> → {user(t.to)}</> : ' (board)'}{t.status === 'accepted' && t.resolvedBy && t.kind === 'listing' && <> · taken by {user(t.resolvedBy)}</>}</>}
            />
          ))}
        </section>
      )}
    </div>
  );
}
