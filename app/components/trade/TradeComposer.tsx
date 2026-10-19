'use client';
import { Icon } from '@/app/components/Icon';
import { InfoTip } from '@/app/components/InfoTip';
import { UserInput } from '@/app/components/UserInput';
import { Spinner } from '../../admin/components/PendingButton';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cardThumbUrl } from '@/lib/card-art';
import { VARIANT_LABELS, encodeEntry } from '@/lib/variants';
import { getRarity } from '@/lib/rarity';
import type { Variant } from '@/lib/types';
import { postJson } from '../captcha-client';
import type { TradeItem } from '@/lib/trade-core';
import { newestIds, stackPoints, type PrintPool, type TradeCardInfo } from '@/lib/trade-view-core';
import { fairness } from '@/lib/trade-match';
import type { SerialPool } from '@/lib/serials-core';
import { TradeStacks } from './TradeStacks';
import { PrintPicker } from './PrintPicker';

type Holdings = Record<number, Partial<Record<Variant, number>>>;
const SHORT: Record<Variant, string> = { regular: 'Reg', reverse: 'RH', full: 'FA', shiny: 'SH' };
const MAX_COPIES = 99;

/**
 * Builds an offer: pick what you give (from your own cards), what you want back (the other person's cards for a direct offer,
 * any card for the board), add a note, and send. For a counter-offer it answers an existing offer instead.
 * The server re-checks everything (ownership, limits, who the offer is for), so this only guides.
 */
export function TradeComposer({
  seasonId, cards, mine, minePool = {}, minePrints = {}, myWanted = [], maxStacks, expiryHours, initial,
}: {
  seasonId: string;
  cards: TradeCardInfo[];
  mine: Holdings;
  /** The serial numbers the viewer holds: trades move the newest first, so the offer is priced with those. */
  minePool?: SerialPool;
  /** The exact prints the viewer holds (empty while the season's prints are not numbered: then there is nothing to choose). */
  minePrints?: PrintPool;
  /** Cards on the viewer's own Looking for list. */
  myWanted?: number[];
  maxStacks: number;
  expiryHours: number;
  initial: { kind: 'direct' | 'listing'; to: string; give: TradeItem[]; get: TradeItem[]; counterOf?: string };
}) {
  const router = useRouter();
  const byNumber = useMemo(() => Object.fromEntries(cards.map(c => [c.number, c])) as Record<number, TradeCardInfo>, [cards]);
  const [kind, setKind] = useState<'direct' | 'listing'>(initial.kind);
  const [to, setTo] = useState(initial.to);
  const [partner, setPartner] = useState<Holdings | null>(null);
  const [partnerWanted, setPartnerWanted] = useState<number[]>([]);
  const [partnerPool, setPartnerPool] = useState<SerialPool>({});
  const [partnerPrints, setPartnerPrints] = useState<PrintPool>({});
  const [okLopsided, setOkLopsided] = useState(false);
  const [partnerError, setPartnerError] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [give, setGive] = useState<TradeItem[]>(initial.give);
  const [get, setGet] = useState<TradeItem[]>(initial.get);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const counter = !!initial.counterOf;

  async function lookUp(pick?: string) {
    const name = (pick ?? to).trim().toLowerCase().replace(/^@/, '');
    if (!name) return;
    setLookingUp(true);
    setPartnerError('');
    setPartner(null);
    setPartnerPool({});
    setPartnerPrints({});
    try {
      const res = await fetch(`/api/trades/holdings?username=${encodeURIComponent(name)}&season=${encodeURIComponent(seasonId)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not find them');
      setTo(name);
      setPartner(body.holdings as Holdings);
      setPartnerWanted(Array.isArray(body.wanted) ? body.wanted : []);
      setPartnerPool(body.pool && typeof body.pool === 'object' ? body.pool as SerialPool : {});
      setPartnerPrints(body.prints && typeof body.prints === 'object' ? body.prints as PrintPool : {});
    } catch (e) {
      setPartnerError(e instanceof Error ? e.message : 'Could not find them');
    } finally {
      setLookingUp(false);
    }
  }
  // A link that names the other person (a counter, an offer started from a card or from their profile) already knows who it is for: load their cards straight away.
  useEffect(() => {
    if (initial.to) lookUp();
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

  const add = (list: TradeItem[], set: (l: TradeItem[]) => void, avail: (n: number, v: Variant) => number, n: number, v: Variant, prints?: PrintPool) => {
    if (avail(n, v) < 1) return;
    const existing = list.find(i => i.cardNumber === n && i.variant === v);
    if (existing) set(list.map(i => (i === existing ? resized(i, i.count + 1, prints) : i)));
    else if (list.length < maxStacks) set([...list, { cardNumber: n, variant: v, count: 1 }]);
  };
  const adjust = (list: TradeItem[], set: (l: TradeItem[]) => void, avail: (n: number, v: Variant) => number, item: TradeItem, delta: number, prints?: PrintPool) => {
    if (delta > 0 && avail(item.cardNumber, item.variant) < 1) return;
    const count = item.count + delta;
    set(count < 1 ? list.filter(i => i !== item) : list.map(i => (i === item ? resized(i, count, prints) : i)));
  };
  // Choose the exact prints of a stack (or go back to "any print" with undefined).
  const setIds = (list: TradeItem[], set: (l: TradeItem[]) => void, item: TradeItem, ids: string[] | undefined) => {
    set(list.map(i => (i === item ? withIds(i, ids) : i)));
  };
  const getPrints = kind === 'direct' ? partnerPrints : undefined;

  // Your copies leave newest first, so a low serial number stays with you unless you give up every copy of that version.
  const givePts = stackPoints(give, byNumber, minePool);
  const getPts = stackPoints(get, byNumber, kind === 'direct' ? partnerPool : undefined);
  const verdict = fairness(givePts, getPts);
  const ready = give.length > 0 && get.length > 0 && (kind === 'listing' || !!to.trim()) && (!verdict.warn || okLopsided);

  // Quick picks from the Looking for lists: what they want that you own, and what you want that they have.
  const bestOwned = (n: number): Variant | null => (['regular', 'reverse', 'full', 'shiny'] as Variant[]).find(v => giveAvail(n, v) > 0) ?? null;
  const theyWantAndYouHave = kind === 'direct' && partner ? partnerWanted.filter(n => byNumber[n] && bestOwned(n)) : [];
  const youWantAndTheyHave = kind === 'direct' && partner ? myWanted.filter(n => byNumber[n] && (['regular', 'reverse', 'full', 'shiny'] as Variant[]).some(v => getAvail(n, v) > 0)) : [];
  const bestTheirs = (n: number): Variant | null => (['regular', 'reverse', 'full', 'shiny'] as Variant[]).find(v => getAvail(n, v) > 0) ?? null;

  async function send() {
    setBusy(true);
    setError('');
    try {
      const payload = { give, get, note };
      const res = counter
        ? await postJson(`/api/trades/${initial.counterOf}`, { action: 'counter', ...payload })
        : await postJson('/api/trades', { kind, seasonId, to: kind === 'direct' ? to : undefined, ...payload });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `That didn't work (${res.status})`);
      router.push('/trade');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn\'t work');
      setBusy(false);
    }
  }

  const input = 'input input-sm';
  return (
    <div className="space-y-6">
      {/* Who */}
      {!counter && (
        <div className="rind rounded-2xl p-4 space-y-3">
          <div role="group" aria-label="Offer type" className="flex flex-wrap gap-2">
            {([['direct', 'To one person', 'target'], ['listing', 'On the open board', 'board']] as const).map(([k, label, icon]) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => { setKind(k); setGet([]); }}
                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${kind === k ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
              ><Icon name={icon} className="mr-1.5" />{label}</button>
            ))}
          </div>
          {kind === 'direct' ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-gray-400" htmlFor="trade-to">Offer to</label>
              <UserInput id="trade-to" value={to} onValueChange={v => { setTo(v); setPartner(null); }} onPick={name => lookUp(name)} onKeyDown={e => { if (e.key === 'Enter' && !e.defaultPrevented) { e.preventDefault(); lookUp(); } }} placeholder="their Twitch name" className={`${input} w-56`} />
              <button type="button" onClick={() => lookUp()} disabled={lookingUp || !to.trim()} className="px-4 py-2 rounded-lg border border-gray-600 text-sm font-semibold text-gray-200 hover:border-yellow-500/60 disabled:opacity-50">{lookingUp ? 'Looking…' : 'Find their cards'}</button>
              {partner && <span className="text-xs text-emerald-300"><Icon name="check" className="mr-1" />found {to}</span>}
              {partnerError && <span role="alert" className="text-xs text-red-400">{partnerError}</span>}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Anyone can take your listing if they have what you ask for. Ask for any card, in any version it can be.</p>
          )}
        </div>
      )}
      {counter && <p className="rind rounded-2xl p-4 text-sm text-gray-300">Countering <strong className="text-yellow-300">{to}</strong>&rsquo;s offer. Their offer is returned to them when you send this; yours goes back to them for an answer.</p>}

      {(theyWantAndYouHave.length > 0 || youWantAndTheyHave.length > 0) && (
        <div className="rind rounded-2xl p-4 space-y-2" aria-label="Quick picks">
          {theyWantAndYouHave.length > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
              <span className="text-gray-400">{to} is looking for:</span>
              {theyWantAndYouHave.map(n => { const v = bestOwned(n)!; return <button key={n} type="button" onClick={() => add(give, setGive, giveAvail, n, v, minePrints)} className="rounded-full border border-purple-400/40 bg-purple-500/10 px-2.5 py-1 text-xs font-bold text-purple-200 hover:bg-purple-500/20">+ {byNumber[n].name}{v === 'regular' ? '' : ` (${SHORT[v]})`}</button>; })}
              <span className="text-xs text-gray-600">you have these</span>
            </p>
          )}
          {youWantAndTheyHave.length > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
              <span className="text-gray-400">You are looking for:</span>
              {youWantAndTheyHave.map(n => { const v = bestTheirs(n)!; return <button key={n} type="button" onClick={() => add(get, setGet, getAvail, n, v, getPrints)} className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1 text-xs font-bold text-yellow-200 hover:bg-yellow-500/20">+ {byNumber[n].name}{v === 'regular' ? '' : ` (${SHORT[v]})`}</button>; })}
              <span className="text-xs text-gray-600">{to} has these</span>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Side
          title="You give"
          pool={minePool}
          prints={minePrints}
          giving
          onIds={(item, ids) => setIds(give, setGive, item, ids)}
          hint="From your collection. These leave it (held in escrow) until the offer ends."
          cards={giveCards}
          items={give}
          avail={giveAvail}
          byNumber={byNumber}
          onAdd={(n, v) => add(give, setGive, giveAvail, n, v, minePrints)}
          onAdjust={(item, d) => adjust(give, setGive, giveAvail, item, d, minePrints)}
          points={givePts}
          maxStacks={maxStacks}
          empty="You don't own any cards to offer yet."
          spareOf={c => Object.values(mine[c.number] ?? {}).some(n => (n ?? 0) >= 2)}
        />
        <Side
          title="You want"
          pool={kind === 'direct' ? partnerPool : undefined}
          prints={getPrints}
          onIds={(item, ids) => setIds(get, setGet, item, ids)}
          hint={kind === 'direct' ? (partner ? `Cards ${to} has.` : 'Find their cards first.') : 'Any card, in any version it can be.'}
          cards={getCards}
          items={get}
          avail={getAvail}
          byNumber={byNumber}
          onAdd={(n, v) => add(get, setGet, getAvail, n, v, getPrints)}
          onAdjust={(item, d) => adjust(get, setGet, getAvail, item, d, getPrints)}
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
            <span className={`ml-2 inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${verdict.warn ? 'border-amber-400/50 bg-amber-500/10 text-amber-300' : verdict.label === 'Even' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300' : 'border-gray-700 text-gray-400'}`}>{verdict.label}</span><InfoTip term="fairness" />
            <span className="block text-xs text-gray-500 mt-1">Values move as cards are pulled and traded, so treat these as a guide.</span>
          </p>
        )}
        {verdict.warn && (
          <label className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
            <input type="checkbox" checked={okLopsided} onChange={e => setOkLopsided(e.target.checked)} className="mt-0.5 h-4 w-4 accent-yellow-500" />
            <span>You are giving much more than you get. I understand and want to send it anyway.</span>
          </label>
        )}
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Note (optional)</legend>
          <input value={note} maxLength={140} onChange={e => setNote(e.target.value)} placeholder="e.g. my last Shiny for your Full Art?" className={`${input} w-full`} />
        </fieldset>
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
  title, hint, cards, items, avail, byNumber, onAdd, onAdjust, points, maxStacks, empty, spareOf, pool, prints, onIds, giving = false,
}: {
  /** The prints that could be ticked for each stack (absent or empty: nothing to choose). */
  prints?: PrintPool;
  onIds?: (item: TradeItem, ids: string[] | undefined) => void;
  /** These prints leave the viewer (warn about prints worth keeping). */
  giving?: boolean;
  /** The serial numbers these stacks would come from (the newest move first), shown on each stack. */
  pool?: SerialPool;
  title: string; hint: string; cards: TradeCardInfo[]; items: TradeItem[]; avail: (n: number, v: Variant) => number;
  byNumber: Record<number, TradeCardInfo>; onAdd: (n: number, v: Variant) => void; onAdjust: (item: TradeItem, delta: number) => void;
  points: number; maxStacks: number; empty: string;
  /** When given, a "Spares only" filter appears: cards with two or more copies of some version. */
  spareOf?: (c: TradeCardInfo) => boolean;
}) {
  const [q, setQ] = useState('');
  const [spares, setSpares] = useState(false);
  const shown = cards.filter(c => (!q.trim() || `${c.name} ${c.number}`.toLowerCase().includes(q.trim().toLowerCase())) && (!spares || !spareOf || spareOf(c)));
  return (
    <section className="card tcg-panel rounded-2xl p-4 space-y-3 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-white">{title}</h2>
        <span className="text-xs text-gray-500">≈ {points.toLocaleString()} pts · {items.length}/{maxStacks} stacks</span>
      </div>
      <p className="text-xs text-gray-500">{hint}{giving && <InfoTip term="escrow" />}</p>

      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map(item => (
            <li key={`${item.cardNumber}:${item.variant}`} className="flex flex-wrap items-center justify-between gap-2">
              <TradeStacks items={[item]} cards={byNumber} pool={pool} hideCount />
              <span className="flex items-center gap-1.5 shrink-0">
                <button type="button" aria-label="One fewer" onClick={() => onAdjust(item, -1)} className="w-7 h-7 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500">−</button>
                <span className="w-6 text-center text-sm font-bold text-yellow-300 tabular-nums">{item.count}</span>
                <button type="button" aria-label="One more" disabled={avail(item.cardNumber, item.variant) < 1} onClick={() => onAdjust(item, 1)} className="w-7 h-7 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-30">+</button>
              </span>
              {(() => {
                const list = prints?.[encodeEntry(item.cardNumber, item.variant)] ?? [];
                if (!onIds || list.length === 0 || (list.length <= item.count && !item.ids)) return null;
                return item.ids ? (
                  <div className="w-full space-y-1">
                    <PrintPicker prints={list} count={item.count} selected={item.ids} onChange={ids => onIds(item, ids)} card={byNumber[item.cardNumber]} giving={giving} />
                    <button type="button" onClick={() => onIds(item, undefined)} className="text-[11px] font-semibold text-gray-400 hover:text-white">Any print (the newest)</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => onIds(item, newestIds(list, item.count))} className="text-[11px] font-semibold text-yellow-400 hover:text-yellow-300">Choose prints ({list.length} to pick from)</button>
                );
              })()}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-gray-600 italic">Nothing chosen yet.</p>}

      <div className="border-t border-gray-800 pt-3 space-y-2">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search cards…" aria-label={`Search ${title} cards`} className="input input-sm w-full" />
        {spareOf && cards.length > 0 && (
          <button type="button" onClick={() => setSpares(x => !x)} aria-pressed={spares} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${spares ? 'bg-yellow-500 text-gray-950 border-yellow-500' : 'border-gray-700 text-gray-400 hover:text-white'}`}>Spares only (2+ prints)</button>
        )}
        {cards.length === 0 ? <p className="text-sm text-gray-500">{empty}</p> : (
          <ul className="max-h-72 overflow-y-auto space-y-1 pr-1">
            {shown.map(c => {
              const rarity = getRarity(c.stars);
              return (
                <li key={c.number} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-gray-950/40 px-2 py-1.5">
                  <span className="w-7 h-10 rounded-sm overflow-hidden shrink-0 border" style={{ borderColor: rarity?.hex }}><img src={cardThumbUrl(c.imageUrl)} alt="" loading="lazy" className="w-full h-full object-cover" /></span>
                  <span className="flex-1 min-w-28 text-xs"><span className="block font-semibold text-gray-200 truncate">{c.name}</span><span className="text-gray-600">#{c.number} · {'★'.repeat(c.stars)}</span></span>
                  <span className="flex flex-wrap justify-end gap-1 ml-auto">
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

/** The stack with exactly these prints (or none: any print). */
function withIds(item: TradeItem, ids: string[] | undefined): TradeItem {
  const { ids: _drop, ...rest } = item;
  void _drop;
  return ids ? { ...rest, ids } : rest;
}

/** The stack at a new count. Chosen prints follow it: one more takes the newest print not ticked yet, one fewer drops the last tick. */
function resized(item: TradeItem, count: number, prints?: PrintPool): TradeItem {
  if (!item.ids) return { ...item, count };
  if (count <= item.ids.length) return { ...item, count, ids: item.ids.slice(0, count) };
  const extra = [...(prints?.[encodeEntry(item.cardNumber, item.variant)] ?? [])].sort((a, b) => b.n - a.n).filter(p => !item.ids!.includes(p.id)).slice(0, count - item.ids.length).map(p => p.id);
  return extra.length === count - item.ids.length ? { ...item, count, ids: [...item.ids, ...extra] } : withIds({ ...item, count }, undefined);
}
