'use client';
import { Spinner } from '../../admin/components/PendingButton';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cardThumbUrl } from '@/lib/card-art';
import { VARIANT_LABELS } from '@/lib/variants';
import { getRarity } from '@/lib/rarity';
import type { Variant } from '@/lib/types';
import type { TradeItem } from '@/lib/trade-core';
import { stackPoints, type TradeCardInfo } from '@/lib/trade-view-core';
import { TradeStacks } from './TradeStacks';

type Holdings = Record<number, Partial<Record<Variant, number>>>;
const SHORT: Record<Variant, string> = { regular: 'Reg', reverse: 'RH', full: 'FA', shiny: '✨' };
const MAX_COPIES = 99;

/**
 * Builds an offer: pick what you give (from your own cards), what you want back (the other person's cards for a direct offer,
 * any card for the board), add a note, and send. For a counter-offer it answers an existing offer instead.
 * The server re-checks everything (ownership, limits, who the offer is for), so this only guides.
 */
export function TradeComposer({
  seasonId, cards, mine, maxStacks, expiryHours, initial,
}: {
  seasonId: string;
  cards: TradeCardInfo[];
  mine: Holdings;
  maxStacks: number;
  expiryHours: number;
  initial: { kind: 'direct' | 'listing'; to: string; give: TradeItem[]; get: TradeItem[]; counterOf?: string };
}) {
  const router = useRouter();
  const byNumber = useMemo(() => Object.fromEntries(cards.map(c => [c.number, c])) as Record<number, TradeCardInfo>, [cards]);
  const [kind, setKind] = useState<'direct' | 'listing'>(initial.kind);
  const [to, setTo] = useState(initial.to);
  const [partner, setPartner] = useState<Holdings | null>(null);
  const [partnerError, setPartnerError] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [give, setGive] = useState<TradeItem[]>(initial.give);
  const [get, setGet] = useState<TradeItem[]>(initial.get);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const counter = !!initial.counterOf;

  async function lookUp() {
    const name = to.trim().toLowerCase().replace(/^@/, '');
    if (!name) return;
    setLookingUp(true);
    setPartnerError('');
    setPartner(null);
    try {
      const res = await fetch(`/api/trades/holdings?username=${encodeURIComponent(name)}&season=${encodeURIComponent(seasonId)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not find them');
      setTo(name);
      setPartner(body.holdings as Holdings);
    } catch (e) {
      setPartnerError(e instanceof Error ? e.message : 'Could not find them');
    } finally {
      setLookingUp(false);
    }
  }
  // A counter, or an offer started from a card, already knows who it is for: load their cards straight away.
  useEffect(() => {
    if (initial.to && (counter || initial.get.length > 0)) lookUp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // What can be picked on each side, and how many of each.
  const taken = (list: TradeItem[], n: number, v: Variant) => list.find(i => i.cardNumber === n && i.variant === v)?.count ?? 0;
  const giveAvail = (n: number, v: Variant) => Math.max(0, (mine[n]?.[v] ?? 0) - taken(give, n, v));
  const getAvail = (n: number, v: Variant) => {
    const cap = kind === 'direct' ? partner?.[n]?.[v] ?? 0 : byNumber[n]?.variants.includes(v) ? MAX_COPIES : 0;
    return Math.max(0, Math.min(MAX_COPIES, cap) - taken(get, n, v));
  };
  const giveCards = cards.filter(c => Object.values(mine[c.number] ?? {}).some(n => (n ?? 0) > 0));
  const getCards = kind === 'direct' ? cards.filter(c => Object.values(partner?.[c.number] ?? {}).some(n => (n ?? 0) > 0)) : cards;

  const add = (list: TradeItem[], set: (l: TradeItem[]) => void, avail: (n: number, v: Variant) => number, n: number, v: Variant) => {
    if (avail(n, v) < 1) return;
    const existing = list.find(i => i.cardNumber === n && i.variant === v);
    if (existing) set(list.map(i => (i === existing ? { ...i, count: i.count + 1 } : i)));
    else if (list.length < maxStacks) set([...list, { cardNumber: n, variant: v, count: 1 }]);
  };
  const adjust = (list: TradeItem[], set: (l: TradeItem[]) => void, avail: (n: number, v: Variant) => number, item: TradeItem, delta: number) => {
    if (delta > 0 && avail(item.cardNumber, item.variant) < 1) return;
    const count = item.count + delta;
    set(count < 1 ? list.filter(i => i !== item) : list.map(i => (i === item ? { ...i, count } : i)));
  };

  const givePts = stackPoints(give, byNumber);
  const getPts = stackPoints(get, byNumber);
  const ready = give.length > 0 && get.length > 0 && (kind === 'listing' || !!to.trim());

  async function send() {
    setBusy(true);
    setError('');
    try {
      const payload = { give, get, note };
      const res = counter
        ? await fetch(`/api/trades/${initial.counterOf}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'counter', ...payload }) })
        : await fetch('/api/trades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, seasonId, to: kind === 'direct' ? to : undefined, ...payload }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `That didn't work (${res.status})`);
      router.push('/trade');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn\'t work');
      setBusy(false);
    }
  }

  const input = 'rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500';
  return (
    <div className="space-y-6">
      {/* Who */}
      {!counter && (
        <div className="rind rounded-2xl p-4 space-y-3">
          <div role="group" aria-label="Offer type" className="flex flex-wrap gap-2">
            {([['direct', '🎯 To one person'], ['listing', '📋 On the open board']] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => { setKind(k); setGet([]); }}
                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${kind === k ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
              >{label}</button>
            ))}
          </div>
          {kind === 'direct' ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-gray-400" htmlFor="trade-to">Offer to</label>
              <input id="trade-to" value={to} onChange={e => { setTo(e.target.value); setPartner(null); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookUp(); } }} placeholder="their Twitch name" className={`${input} w-56`} />
              <button type="button" onClick={lookUp} disabled={lookingUp || !to.trim()} className="px-4 py-2 rounded-lg border border-gray-600 text-sm font-semibold text-gray-200 hover:border-yellow-500/60 disabled:opacity-50">{lookingUp ? 'Looking…' : 'Find their cards'}</button>
              {partner && <span className="text-xs text-emerald-300">✓ found {to}</span>}
              {partnerError && <span role="alert" className="text-xs text-red-400">{partnerError}</span>}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Anyone can take your listing if they have what you ask for. Ask for any card, in any version it can be.</p>
          )}
        </div>
      )}
      {counter && <p className="rind rounded-2xl p-4 text-sm text-gray-300">Countering <strong className="text-yellow-300">{to}</strong>&rsquo;s offer. Their offer is returned to them when you send this; yours goes back to them for an answer.</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Side
          title="You give"
          hint="From your collection. These leave it (held in escrow) until the offer ends."
          cards={giveCards}
          items={give}
          avail={giveAvail}
          byNumber={byNumber}
          onAdd={(n, v) => add(give, setGive, giveAvail, n, v)}
          onAdjust={(item, d) => adjust(give, setGive, giveAvail, item, d)}
          points={givePts}
          maxStacks={maxStacks}
          empty="You don't own any cards to offer yet."
        />
        <Side
          title="You want"
          hint={kind === 'direct' ? (partner ? `Cards ${to} has.` : 'Find their cards first.') : 'Any card, in any version it can be.'}
          cards={getCards}
          items={get}
          avail={getAvail}
          byNumber={byNumber}
          onAdd={(n, v) => add(get, setGet, getAvail, n, v)}
          onAdjust={(item, d) => adjust(get, setGet, getAvail, item, d)}
          points={getPts}
          maxStacks={maxStacks}
          empty={kind === 'direct' ? 'Look the person up to see what they have.' : 'No cards.'}
        />
      </div>

      <div className="rind rounded-2xl p-4 space-y-3">
        {give.length > 0 && get.length > 0 && (
          <p className="text-sm text-gray-300">
            You give <strong className="text-white">≈ {givePts.toLocaleString()} pts</strong> and get <strong className="text-white">≈ {getPts.toLocaleString()} pts</strong>
            {Math.abs(givePts - getPts) > 0 && <span className="text-gray-500"> ({getPts >= givePts ? '+' : '−'}{Math.abs(getPts - givePts).toLocaleString()} for you)</span>}.
            <span className="block text-xs text-gray-500 mt-1">Values move as cards are pulled and traded, so treat these as a guide.</span>
          </p>
        )}
        <label className="block text-xs text-gray-500 space-y-1">Note (optional)
          <input value={note} maxLength={140} onChange={e => setNote(e.target.value)} placeholder="e.g. my last Shiny for your Full Art?" className={`${input} w-full`} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={send} disabled={!ready || busy} className="tcg-btn inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm disabled:opacity-50">{busy ? <><Spinner /> Sending…</> : counter ? 'Send counter-offer' : kind === 'listing' ? 'Post to the board' : 'Send offer'}</button>
          <span className="text-xs text-gray-500">Lasts {expiryHours}h. You can cancel any time to get your cards back.</span>
        </div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}

/** One side of the offer: the selected stacks on top, a searchable card picker below. */
function Side({
  title, hint, cards, items, avail, byNumber, onAdd, onAdjust, points, maxStacks, empty,
}: {
  title: string; hint: string; cards: TradeCardInfo[]; items: TradeItem[]; avail: (n: number, v: Variant) => number;
  byNumber: Record<number, TradeCardInfo>; onAdd: (n: number, v: Variant) => void; onAdjust: (item: TradeItem, delta: number) => void;
  points: number; maxStacks: number; empty: string;
}) {
  const [q, setQ] = useState('');
  const shown = cards.filter(c => !q.trim() || `${c.name} ${c.number}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/70 p-4 space-y-3 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-white">{title}</h2>
        <span className="text-xs text-gray-500">≈ {points.toLocaleString()} pts · {items.length}/{maxStacks} stacks</span>
      </div>
      <p className="text-xs text-gray-500">{hint}</p>

      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map(item => (
            <li key={`${item.cardNumber}:${item.variant}`} className="flex items-center justify-between gap-2">
              <TradeStacks items={[{ ...item, count: 1 }]} cards={byNumber} />
              <span className="flex items-center gap-1.5 shrink-0">
                <button type="button" aria-label="One fewer" onClick={() => onAdjust(item, -1)} className="w-7 h-7 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500">−</button>
                <span className="w-6 text-center text-sm font-bold text-yellow-300 tabular-nums">{item.count}</span>
                <button type="button" aria-label="One more" disabled={avail(item.cardNumber, item.variant) < 1} onClick={() => onAdjust(item, 1)} className="w-7 h-7 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-30">+</button>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-gray-600 italic">Nothing chosen yet.</p>}

      <div className="border-t border-gray-800 pt-3 space-y-2">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search cards…" aria-label={`Search ${title} cards`} className="w-full rounded-lg bg-gray-950 border border-gray-700 px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500" />
        {cards.length === 0 ? <p className="text-sm text-gray-500">{empty}</p> : (
          <ul className="max-h-72 overflow-y-auto space-y-1 pr-1">
            {shown.map(c => {
              const rarity = getRarity(c.stars);
              return (
                <li key={c.number} className="flex items-center gap-2 rounded-lg bg-gray-950/40 px-2 py-1.5">
                  <span className="w-7 h-10 rounded overflow-hidden shrink-0 border" style={{ borderColor: rarity?.hex }}><img src={cardThumbUrl(c.imageUrl)} alt="" loading="lazy" className="w-full h-full object-cover" /></span>
                  <span className="flex-1 min-w-0 text-xs"><span className="block font-semibold text-gray-200 truncate">{c.name}</span><span className="text-gray-600">#{c.number} · {'★'.repeat(c.stars)}</span></span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {c.variants.map(v => {
                      const n = avail(c.number, v);
                      return (
                        <button
                          key={v}
                          type="button"
                          disabled={n < 1}
                          onClick={() => onAdd(c.number, v)}
                          title={`${VARIANT_LABELS[v]}: ${n < 1 ? 'none available' : `add one (${n} available)`}`}
                          className="px-1.5 py-0.5 rounded-md text-[11px] font-bold border border-gray-700 text-gray-300 hover:border-yellow-500/60 hover:text-yellow-300 disabled:opacity-30 disabled:hover:border-gray-700 disabled:hover:text-gray-300"
                        >{SHORT[v]}{n >= MAX_COPIES ? '' : ` ${n}`}</button>
                      );
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
