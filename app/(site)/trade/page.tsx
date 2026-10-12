import { Icon } from '@/app/components/Icon';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession, loginConfigured } from '@/lib/session';
import { getCollection } from '@/lib/kv';
import { getActive } from '@/lib/site-seasons';
import { getTradeSettings, sweepTrades, tradesForUser, listOpenTrades } from '@/lib/trades';
import { describeItems, firstMissing } from '@/lib/trade-core';
import { getTradeCards } from '@/lib/trade-view';
import { TradeCard } from '@/app/components/trade/TradeCard';
import { TradeActions } from '@/app/components/trade/TradeActions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Trade', description: 'Swap cards with other collectors.', robots: { index: false, follow: true } };

const user = (name: string) => (
  <Link href={`/u/${name}`} className="text-yellow-300 hover:text-yellow-200 font-bold">@{name}</Link>
);

export default async function TradePage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const { season: seasonParam } = await searchParams;
  const [session, { season, seasons }, settings] = await Promise.all([getSession(), getActive(seasonParam), getTradeSettings()]);
  await sweepTrades(); // refund anything that has run out of time before showing it

  if (!season) {
    return <div className="max-w-5xl mx-auto px-4 py-10"><p className="rind rounded-2xl p-8 text-center text-gray-400">No season is running right now, so there is nothing to trade yet.</p></div>;
  }

  const cards = await getTradeCards(season);
  const me = session?.username;
  const mine = me ? await tradesForUser(me) : null;
  const owned = me ? (await getCollection(season.collectionName))[me] ?? [] : [];
  const here = <T extends { seasonId: string }>(list: T[]) => list.filter(t => t.seasonId === season.id);
  const board = here((await listOpenTrades()).filter(t => t.kind === 'listing' && t.from !== me));
  const incoming = mine ? here(mine.incoming) : [];
  const outgoing = mine ? here(mine.outgoing) : [];
  const recent = mine ? here(mine.recent) : [];
  const nameOf = (n: number) => cards[n]?.name;

  const section = 'space-y-3';
  const heading = 'font-display text-xl font-bold text-white flex items-center gap-2';

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
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

      {session && incoming.length > 0 && (
        <section className={section}>
          <h2 className={heading}><Icon name="inbox" className="mr-2" />Offers for you <span className="text-sm font-normal text-gray-500">({incoming.length})</span></h2>
          {incoming.map(t => {
            const lack = firstMissing(owned, t.get);
            return (
              <TradeCard
                key={t.id}
                trade={t}
                cards={cards}
                title={<>{user(t.from)} offered you a trade</>}
                actions={<TradeActions tradeId={t.id} mode="incoming" canAccept={!lack && settings.enabled} blocked={lack ? `You need ${describeItems([lack], nameOf)}` : undefined} />}
              />
            );
          })}
        </section>
      )}

      {session && outgoing.length > 0 && (
        <section className={section}>
          <h2 className={heading}><Icon name="send" className="mr-2" />Your open offers <span className="text-sm font-normal text-gray-500">({outgoing.length}/{settings.maxOpenPerUser})</span></h2>
          {outgoing.map(t => (
            <TradeCard
              key={t.id}
              trade={t}
              cards={cards}
              title={t.kind === 'direct' ? <>You offered {user(t.to!)} a trade</> : <>Your listing on the board</>}
              actions={<TradeActions tradeId={t.id} mode="outgoing" />}
            />
          ))}
          <p className="text-xs text-gray-500">The cards you offered are in escrow while an offer is open. Cancelling returns them straight away.</p>
        </section>
      )}

      <section className={section}>
        <h2 className={heading}><Icon name="board" className="mr-2" />The board <span className="text-sm font-normal text-gray-500">({board.length})</span></h2>
        {board.length === 0 ? (
          <p className="rind rounded-2xl p-6 text-center text-sm text-gray-400">Nothing on the board right now. Post a listing and let others come to you.</p>
        ) : board.map(t => {
          const lack = firstMissing(owned, t.get);
          return (
            <TradeCard
              key={t.id}
              trade={t}
              cards={cards}
              title={<>{user(t.from)}&rsquo;s listing</>}
              actions={session
                ? <TradeActions tradeId={t.id} mode="board" canAccept={!lack && settings.enabled} blocked={lack ? `You need ${describeItems([lack], nameOf)}` : undefined} />
                : <span className="text-xs text-gray-500">Log in to take a trade</span>}
            />
          );
        })}
      </section>

      {session && recent.length > 0 && (
        <section className={section}>
          <h2 className={heading}><Icon name="history" className="mr-2" />Recent</h2>
          {recent.slice(0, 8).map(t => (
            <TradeCard
              key={t.id}
              trade={t}
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
