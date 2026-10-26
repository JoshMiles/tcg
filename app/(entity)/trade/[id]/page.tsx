import { Icon } from '@/app/components/Icon';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession, loginConfigured } from '@/lib/session';
import { getCollection, getSeason } from '@/lib/kv';
import { getTrade, getTradeSettings, sweepTrades } from '@/lib/trades';
import { describeItems, firstMissing, tradeVisibleTo, type Trade } from '@/lib/trade-core';
import { getTradeCards, getTradePools, poolsFor, stackPoints } from '@/lib/trade-view';
import { fairness } from '@/lib/trade-match';
import { wantedForTrades } from '@/lib/watch-index';
import { TradeCard } from '@/app/components/trade/TradeCard';
import { TradeActions } from '@/app/components/trade/TradeActions';
import { pickPropsFor } from '@/lib/trade-view-core';
import { profileHref } from '@/lib/profile-url';
import { hasStaffCapability } from '@/lib/staff-guard';
import { StaffBadge } from '@/app/components/StaffBadge';
import { getStaffBadges } from '@/lib/staff-badge';
import type { StaffBadge as StaffBadgeKind } from '@/lib/staff-badge-core';
import { ReverseTrade } from '@/app/admin/trades/ReverseTrade';

export const metadata: Metadata = { title: 'Trade', description: 'A trade offer.', robots: { index: false, follow: true } };

const userWith = (badges: Record<string, StaffBadgeKind>) => (name: string) => (
  <><Link href={profileHref(name)} className="text-yellow-300 hover:text-yellow-200 font-bold">@{name}</Link>{badges[name.toLowerCase()] && <> <StaffBadge badge={badges[name.toLowerCase()]} /></>}</>
);

const OUTCOME: Record<string, string> = {
  accepted: 'This trade was completed.',
  declined: 'This offer was declined.',
  cancelled: 'This trade was cancelled.',
  expired: 'This trade ran out of time.',
  countered: 'This offer was answered with a counter-offer.',
  failed: 'This trade could not be completed.',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-5">
      <p className="text-sm"><Link href="/trade?tab=board" className="text-gray-400 hover:text-white"><Icon name="chevronLeft" className="mr-1" />The board</Link></p>
      {children}
    </div>
  );
}

export default async function TradeOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sweepTrades(); // an offer that has run out of time is refunded and shown as expired
  const [session, trade, settings] = await Promise.all([getSession(), getTrade(id), getTradeSettings()]);
  if (!trade) notFound();
  const season = await getSeason(trade.seasonId);
  if (!season) notFound();

  const user = userWith(await getStaffBadges());
  const me = session?.username.toLowerCase() ?? null;
  const returnTo = `/trade/${encodeURIComponent(trade.id)}`;
  const login = !session && loginConfigured()
    ? <Link href={`/auth/twitch?returnTo=${encodeURIComponent(returnTo)}`} className="btn btn-primary px-5 py-2.5 rounded-xl text-sm inline-block">Log in with Twitch</Link>
    : null;

  if (!tradeVisibleTo(trade, me)) {
    return (
      <Shell>
        <section className="rind rounded-2xl p-8 text-center space-y-3">
          <h1 className="font-display text-2xl font-bold text-white"><Icon name="trade" className="mr-2 text-yellow-400" />This is a private offer</h1>
          <p className="text-sm text-gray-400">{session ? 'It was made to one person, so only the two people in it can see it.' : 'It was made to one person. If it is for you, log in with Twitch to see it.'}</p>
          {login}
        </section>
      </Shell>
    );
  }

  const [cards, owned] = await Promise.all([
    getTradeCards(season),
    me ? getCollection(season.collectionName).then(c => c[me] ?? []) : Promise.resolve([] as number[]),
  ]);
  const pools = await getTradePools(season, [trade], me);
  const wanted = (await wantedForTrades([trade]))[trade.id];
  const nameOf = (n: number) => cards[n]?.name;
  const open = trade.status === 'open';
  const staffCanReverse = trade.status === 'accepted' && !trade.reversedAt && (await hasStaffCapability('mod'));
  const isFrom = me === trade.from;
  const isTo = !!me && me === trade.to;
  const title = trade.kind === 'listing'
    ? <>{user(trade.from)}&rsquo;s listing on the board</>
    : isFrom ? <>You offered {user(trade.to!)} a trade</> : <>{user(trade.from)} offered {isTo ? 'you' : user(trade.to!)} a trade</>;

  let actions: React.ReactNode = null;
  let verdict: string | null = null;
  if (open) {
    if (isFrom) actions = <TradeActions tradeId={trade.id} mode="outgoing" />;
    else if (session) {
      const lack = firstMissing(owned, trade.get);
      actions = (
        <TradeActions
          tradeId={trade.id}
          mode={isTo ? 'incoming' : 'board'}
          pick={pickPropsFor(trade, me, cards)}
          canAccept={!lack && settings.enabled && !season.tradingFrozen}
          blocked={lack ? `You need ${describeItems([lack], nameOf)}` : undefined}
        />
      );
      // From the taker's side: you hand over what the lister asks for and receive what they give.
      const p = poolsFor(trade, pools);
      const label = fairness(stackPoints(trade.get, cards, p.get), stackPoints(trade.give, cards, p.give)).label;
      verdict = label === 'Generous to them' ? 'Very much in your favour' : label; // the composer words the extreme for the person offering
    } else if (login) {
      actions = <span className="flex flex-col items-end gap-2 text-xs text-gray-400">Log in with Twitch to take this trade{login}</span>;
    }
  }

  return (
    <Shell>
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-bold text-white"><Icon name="trade" className="mr-2 text-yellow-400" />{trade.kind === 'listing' ? 'Trade listing' : 'Trade offer'}</h1>
        {open && !settings.enabled && <p className="text-sm text-amber-200">Trading is paused right now, so nothing can be taken until it is switched back on.</p>}
        {open && season.tradingFrozen && <p className="text-sm text-amber-200">Trading is closed for {season.name}.</p>}
      </header>

      {!open && <OutcomeNote trade={trade} user={user} />}
      {staffCanReverse && <ReverseTrade tradeId={trade.id} />}
      <TradeCard trade={trade} cards={cards} pools={pools} wanted={wanted} title={title} actions={actions} />
      {verdict && verdict !== 'Empty' && <p className="text-xs text-gray-500">For you: <strong className="text-gray-300">{verdict}</strong>, going by the points on each side.</p>}
    </Shell>
  );
}

function OutcomeNote({ trade, user }: { trade: Trade; user: (name: string) => React.ReactNode }) {
  if (trade.reversedAt) {
    return (
      <p role="status" className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">
        <Icon name="shield" className="mr-1" />Reversed by staff: every edition in this trade went back to where it started.{trade.reverseReason ? <> Reason: {trade.reverseReason}</> : null}
      </p>
    );
  }
  const by = trade.status === 'accepted' && trade.resolvedBy && trade.resolvedBy !== 'admin' ? user(trade.resolvedBy) : null;
  return (
    <p role="status" className="rounded-xl border border-gray-700 bg-gray-900/70 px-4 py-3 text-sm text-gray-200">
      {OUTCOME[trade.status] ?? 'This trade is closed.'}{by && <> Taken by {by}.</>}
    </p>
  );
}
