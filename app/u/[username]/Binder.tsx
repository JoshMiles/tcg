'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/app/components/Icon';
import { CardTile } from '@/app/components/CardTile';
import { getRarity } from '@/lib/rarity';
import { holoClass, holoVars } from '@/lib/holo-core';
import { VARIANTS, VARIANT_LABELS, type VariantCounts } from '@/lib/variants';
import { buildBinderPages, buildSpreads, clampSpread, spreadOfPage, type BinderPage, type Spread } from '@/lib/binder';
import type { GridCard } from './CollectionGrid';

// A collection as a binder: a cover, then pages of 3x3 pockets, a pack at a time, with an empty pocket for every card still to find.
// Wide screens show two pages like an open book and turn them in 3D; phones show one page at a time. Reduced motion just swaps pages.

const SHORT: Record<string, string> = { regular: '', reverse: 'RH', full: 'FA', shiny: 'SH' };
const total = (c: VariantCounts) => VARIANTS.reduce((s, v) => s + c[v], 0);
const bestOf = (c: VariantCounts) => [...VARIANTS].reverse().find(v => c[v] > 0) ?? 'regular';
const artOf = (c: GridCard, v: string) => ((v === 'full' || v === 'shiny') && c.fullArtImageUrl ? c.fullArtImageUrl : c.imageUrl);
const TURN_MS = 700;

function usePrefs() {
  const [double, setDouble] = useState(false);
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1024px)');
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { setDouble(wide.matches); setReduce(calm.matches || document.querySelector('[data-motion="reduce"]') !== null); };
    sync();
    wide.addEventListener('change', sync); calm.addEventListener('change', sync);
    return () => { wide.removeEventListener('change', sync); calm.removeEventListener('change', sync); };
  }, []);
  return { double, reduce };
}

export function Binder({ cards, ownerLabel, onOpen }: { cards: GridCard[]; ownerLabel: string; onOpen: (idx: number, el: HTMLElement | null) => void }) {
  const { double, reduce } = usePrefs();
  const pages = useMemo(() => buildBinderPages(cards), [cards]);
  const spreads = useMemo(() => buildSpreads(pages, double), [pages, double]);
  const [spread, setSpread] = useState(0);
  const [turning, setTurning] = useState<{ dir: 1 | -1; to: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cur = clampSpread(spread, spreads.length);

  // Switching between one and two pages keeps you on the same page, roughly.
  const lastDouble = useRef(double);
  useEffect(() => {
    if (lastDouble.current === double) return;
    const pageIdx = lastDouble.current ? (spread === 0 ? 0 : spread * 2 - 1) : spread;
    lastDouble.current = double;
    setTurning(null);
    setSpread(spreadOfPage(pageIdx, double));
  }, [double, spread]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const goTo = useCallback((to: number) => {
    const target = clampSpread(to, spreads.length);
    if (target === cur || turning) return;
    if (!double || reduce) { setSpread(target); return; }
    // The leaf turns over one spread at a time; a longer jump just lands on the target after turning once.
    setTurning({ dir: target > cur ? 1 : -1, to: target });
    timer.current = setTimeout(() => { setSpread(target); setTurning(null); }, TURN_MS);
  }, [cur, turning, double, reduce, spreads.length]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(cur + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(cur - 1); }
  };

  const owned = cards.filter(c => total(c.counts) > 0).length;
  const packs = useMemo(() => pages.map((p, i) => ({ p, i })).filter(x => x.p.kind === 'cards' && x.p.part === 1), [pages]);

  const pageView = (p: BinderPage | undefined, side: 'left' | 'right') => {
    if (!p) return <div className="bn-page bn-blank" data-side={side} aria-hidden />;
    if (p.kind === 'cover') return (
      <div className="bn-page bn-cover" data-side={side}>
        <Icon name="cheese" className="bn-cover-icon" />
        <p className="bn-cover-title">{ownerLabel} binder</p>
        <p className="bn-cover-sub">{owned} of {cards.length} cards collected</p>
        <p className="bn-cover-hint">{double ? 'Press the right arrow or the page edge to open it' : 'Swipe or use the arrows to turn the page'}</p>
      </div>
    );
    return (
      <div className="bn-page" data-side={side}>
        <p className="bn-head"><span>{p.pack}</span>{(p.parts ?? 1) > 1 && <span>{p.part}/{p.parts}</span>}</p>
        <div className="bn-grid">
          {p.slots.map((idx, i) => idx === null ? <div key={`e${i}`} className="bn-pocket bn-empty" aria-hidden /> : <Pocket key={cards[idx].id} card={cards[idx]} onOpen={el => onOpen(idx, el)} />)}
        </div>
      </div>
    );
  };

  const sp: Spread | undefined = spreads[cur];
  const next = turning ? spreads[turning.to] : undefined;
  let book: ReactNode;
  if (!double || !turning || !sp || !next) {
    book = (
      <div className={`bn-book ${double ? 'bn-double' : 'bn-single'}`} key={double ? 'd' : cur} data-fade={!double}>
        {double ? <>{pageView(sp?.left, 'left')}{pageView(sp?.right, 'right')}</> : pageView(sp?.right, 'right')}
      </div>
    );
  } else if (turning.dir === 1) {
    // Forward: the right page lifts and swings over to become the next spread's left page, uncovering its right page.
    book = (
      <div className="bn-book bn-double">
        {pageView(sp.left, 'left')}
        {pageView(next.right, 'right')}
        <div className="bn-leaf bn-leaf-next">
          <div className="bn-face">{pageView(sp.right, 'right')}</div>
          <div className="bn-face bn-back">{pageView(next.left, 'left')}</div>
        </div>
      </div>
    );
  } else {
    book = (
      <div className="bn-book bn-double">
        {pageView(next.left, 'left')}
        {pageView(sp.right, 'right')}
        <div className="bn-leaf bn-leaf-prev">
          <div className="bn-face">{pageView(sp.left, 'left')}</div>
          <div className="bn-face bn-back">{pageView(next.right, 'right')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" onKeyDown={onKey}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Jump to a pack">
          <button type="button" onClick={() => goTo(0)} className="bn-chip">Cover</button>
          {packs.map(({ p, i }) => <button key={p.pack} type="button" onClick={() => goTo(spreadOfPage(i, double))} className="bn-chip">{p.pack}</button>)}
        </div>
        <p className="text-xs text-gray-500" aria-live="polite">{sp?.label}</p>
      </div>

      <div className="bn-cover-wrap" tabIndex={0} role="group" aria-label={`${ownerLabel} card binder. Use the left and right arrow keys to turn pages.`}>
        <div className="bn-leather">
          {book}
          {double && <span aria-hidden className="bn-rings"><i /><i /><i /></span>}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={() => goTo(cur - 1)} disabled={cur <= 0 || !!turning} className="bn-nav" aria-label="Previous page"><Icon name="chevronLeft" /> Back</button>
        <button type="button" onClick={() => goTo(cur + 1)} disabled={cur >= spreads.length - 1 || !!turning} className="bn-nav" aria-label="Next page">Next <Icon name="chevronRight" /></button>
      </div>
    </div>
  );
}

function Pocket({ card, onOpen }: { card: GridCard; onOpen: (el: HTMLElement | null) => void }) {
  const count = total(card.counts);
  const rarity = getRarity(card.stars);
  if (count === 0) {
    return (
      <div className="bn-pocket bn-missing" title={`#${card.number} ${card.name} · not collected yet`}>
        <span className="bn-missing-no">#{card.number}</span>
        <span className="bn-missing-name">{card.name}</span>
      </div>
    );
  }
  const best = bestOf(card.counts);
  const art = artOf(card, best);
  const className = `bn-pocket bn-owned holo-hover ${best !== 'regular' ? `vfx-${best}` : ''} ${holoClass(card.holo[best])}`;
  const style = { borderColor: rarity?.hex, ...holoVars(card.holo[best]) } as React.CSSProperties;
  const badges = (
    <>
      {count > 1 && <span className="absolute top-1 left-1 bg-gray-950/85 border border-yellow-500/50 text-yellow-300 text-[10px] font-extrabold px-1.5 rounded-full leading-tight">×{count}</span>}
      {best !== 'regular' && <span className="absolute bottom-1 right-1 bg-gray-950/85 border border-fuchsia-400/50 text-fuchsia-200 text-[9px] font-extrabold px-1.5 rounded-full leading-tight">{SHORT[best]}</span>}
    </>
  );
  const title = `#${card.number} ${card.name}${best !== 'regular' ? ` · ${VARIANT_LABELS[best]}` : ''}${count > 1 ? ` · ×${count}` : ''}`;
  return art
    ? <CardTile imageUrl={art} alt={card.name} title={title} className={className} style={style} onActivate={onOpen}>{badges}</CardTile>
    : <div className={className} style={style} title={title} role="button" tabIndex={0} onClick={e => onOpen(e.currentTarget)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(e.currentTarget); } }}>{badges}</div>;
}
