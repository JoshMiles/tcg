import { Icon } from '@/app/components/Icon';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getCollection } from '@/lib/kv';
import { getActive } from '@/lib/site-seasons';
import { getTrade, getTradeSettings, sweepTrades } from '@/lib/trades';
import { getTradeCards } from '@/lib/trade-view';
import { TradeComposer } from '@/app/components/trade/TradeComposer';
import { VARIANTS, decodeEntry } from '@/lib/variants';
import type { Variant } from '@/lib/types';
import type { TradeItem } from '@/lib/trade-core';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New trade offer' };

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
  if (!season) return wrap(<p className="rind rounded-2xl p-8 text-center text-gray-400">No season is running, so there is nothing to trade yet.</p>);
  if (season.tradingFrozen) return wrap(<p className="rind rounded-2xl p-8 text-center text-amber-200">Trading is closed for {season.name}.</p>);
  if (!settings.enabled) return wrap(<p className="rind rounded-2xl p-8 text-center text-amber-200">Trading is paused right now. Check back soon.</p>);
  if (counter && (!original || original.status !== 'open' || original.kind !== 'direct' || original.to !== session.username)) {
    return wrap(<p className="rind rounded-2xl p-8 text-center text-gray-400">That offer is no longer open, so it can&rsquo;t be countered.</p>);
  }

  const [cards, collection] = await Promise.all([getTradeCards(season), getCollection(season.collectionName)]);
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
        maxStacks={settings.maxStacksPerSide}
        expiryHours={settings.expiryHours}
        initial={{ kind: 'direct', to: original?.from ?? to ?? '', give: startGive, get: startGet, counterOf: original?.id }}
      />
    </>,
  );
}
