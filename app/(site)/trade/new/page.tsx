import { Icon } from '@/app/components/Icon';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getCollection, getUserProfile } from '@/lib/kv';
import { getActive } from '@/lib/site-seasons';
import { getTrade, getTradeSettings, sweepTrades } from '@/lib/trades';
import { getTradeCards } from '@/lib/trade-view';
import { loadSerialIndex } from '@/lib/serials';
import { poolOf } from '@/lib/serials-core';
import { getUserSettings } from '@/lib/user-settings-store';
import { TradeComposer } from '@/app/components/trade/TradeComposer';
import { VARIANTS, decodeEntry } from '@/lib/variants';
import type { Variant } from '@/lib/types';
import type { TradeItem } from '@/lib/trade-core';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New trade offer', robots: { index: false, follow: false } };

export default async function NewTradePage({ searchParams }: { searchParams: Promise<{ to?: string; counter?: string; season?: string; want?: string }> }) {
  const { to, counter, season: seasonParam, want } = await searchParams;
  const session = await getSession();
  if (!session) redirect(`/auth/twitch?returnTo=${encodeURIComponent('/trade/new')}`);

  await sweepTrades();
  const original = counter ? await getTrade(counter) : null;
  const { season } = await getActive(original?.seasonId ?? seasonParam);
  const settings = await getTradeSettings();

  const wrap = (body: React.ReactNode) => (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <Link href="/trade" className="text-sm text-gray-500 hover:text-white">← Trade</Link>
      {body}
    </div>
  );
  // A message in place of the composer. It carries the page's heading too, so a page that only says "no" still has an h1.
  const say = (tone: string, text: React.ReactNode) => wrap(<><h1 className="sr-only">New trade offer</h1><p className={`rind rounded-2xl p-8 text-center ${tone}`}>{text}</p></>);
  if (!season) return say('text-gray-400', 'No season is running, so there is nothing to trade yet.');
  if (season.tradingFrozen) return say('text-amber-200', <>Trading is closed for {season.name}.</>);
  if (!settings.enabled) return say('text-amber-200', 'Trading is paused right now. Check back soon.');
  // A viewer the streamer has switched trading off for would otherwise fill in a whole offer and only learn when sending it.
  if ((await getUserProfile(session.username).catch(() => null))?.flags?.noTrading) return say('text-amber-200', 'Trading isn’t available on your account.');
  if (counter) {
    if (!original || original.status !== 'open') return say('text-gray-400', 'That offer is no longer open, so it can’t be countered.');
    if (original.kind !== 'direct' || original.to !== session.username) return say('text-gray-400', 'That offer wasn’t made to you, so you can’t counter it.');
  }

  const [cards, collection, prefs] = await Promise.all([getTradeCards(season), getCollection(season.collectionName), getUserSettings(session.username)]);
  const mine: Record<number, Partial<Record<Variant, number>>> = {};
  for (const entry of collection[session.username] ?? []) {
    const { cardNumber, variant } = decodeEntry(entry);
    mine[cardNumber] = { ...mine[cardNumber], [variant]: (mine[cardNumber]?.[variant] ?? 0) + 1 };
  }

  // A counter starts from the mirror of the offer: you give what they wanted (as far as you own it), and want what they offered.
  const startGive: TradeItem[] = original
    ? original.get.map(i => ({ ...i, count: Math.min(i.count, mine[i.cardNumber]?.[i.variant] ?? 0) })).filter(i => i.count > 0)
    : [];
  // ?want=<card>.<variant> (from the "Offer a trade" button on a card) pre-selects the card you are asking for.
  const wanted = /^(\d{1,6})\.(regular|reverse|full|shiny)$/.exec(want ?? '');
  const startGet: TradeItem[] = original ? original.give : wanted && VARIANTS.includes(wanted[2] as Variant) ? [{ cardNumber: Number(wanted[1]), variant: wanted[2] as Variant, count: 1 }] : [];

  return wrap(
    <>
      <header className="space-y-1">
        <h1 className="font-display text-4xl font-bold text-white">{original ? <><Icon name="undo" className="mr-2" />Counter-offer</> : <><Icon name="trade" className="mr-2" />New offer</>}</h1>
        <p className="text-sm text-gray-400">Pick what you give and what you want. Nothing leaves your collection until you send it, and it comes back if the offer ends without a trade.</p>
      </header>
      <TradeComposer
        seasonId={season.id}
        cards={Object.values(cards).sort((a, b) => a.number - b.number)}
        mine={mine}
        minePool={poolOf((await loadSerialIndex(season.collectionName))?.held.get(session.username))}
        myWanted={prefs.wanted}
        maxStacks={settings.maxStacksPerSide}
        expiryHours={settings.expiryHours}
        initial={{ kind: 'direct', to: original?.from ?? to ?? '', give: startGive, get: startGet, counterOf: original?.id }}
      />
    </>,
  );
}
