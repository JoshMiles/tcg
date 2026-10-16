'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/app/components/Icon';
import { CardTile } from '@/app/components/CardTile';
import { ShareImageButton } from '@/app/components/ShareImage';
import { getRarity } from '@/lib/rarity';
import { stillFor } from '@/lib/card-art';
import { holoClass, holoVars } from '@/lib/holo-core';
import { VARIANTS, VARIANT_LABELS, type VariantCounts } from '@/lib/variants';
import { buildBinderPages, buildCustomPages, buildSpreads, clampSpread, spreadOfPage, type BinderPage, type Spread } from '@/lib/binder';
import { DEFAULT_BINDER, capacity, coverColour, isLightColour, pageColour, type BinderConfig } from '@/lib/binder-config';
import type { BinderShareSlot, BinderSharePage, ShareSpec } from '@/lib/share-image';
import type { Variant } from '@/lib/types';
import type { GridCard } from './CollectionGrid';

// A collection as a binder: a cover, then pages of pockets, with an empty pocket for every card still to find. The look (cover,
// pages, pockets, grid size) and the layout (automatic by pack, or placed by hand) come from the owner's BinderConfig.
// Wide screens show two pages like an open book and turn them in 3D; phones show one page at a time. Reduced motion just swaps pages.

const SHORT: Record<string, string> = { regular: '', reverse: 'RH', full: 'FA', shiny: 'SH' };
const total = (c: VariantCounts) => VARIANTS.reduce((s, v) => s + c[v], 0);
const bestOf = (c: VariantCounts) => [...VARIANTS].reverse().find(v => c[v] > 0) ?? 'regular';
const artOf = (c: GridCard, v: string) => ((v === 'full' || v === 'shiny') && c.fullArtImageUrl ? c.fullArtImageUrl : c.imageUrl);
const TURN_MS = 700;

/** What the editor gives the book so its pockets can be picked, filled and dragged. Absent when just viewing. */
export interface BinderEditorBridge {
  selected: { page: number; slot: number } | null;
  onSelect: (page: number, slot: number) => void;
  /** `payload` is "card:<number>" from the tray or "slot:<page>:<slot>" from another pocket. */
  onDrop: (page: number, slot: number, payload: string) => void;
  /** Turn to this saved page (n changes so asking for the same page twice works). */
  focus?: { page: number; n: number } | null;
}

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

export function Binder({ cards, ownerLabel, onOpen, config = DEFAULT_BINDER, seasonId, editor, shareFooter }: {
  cards: GridCard[];
  ownerLabel: string;
  onOpen: (idx: number, el: HTMLElement | null) => void;
  config?: BinderConfig;
  seasonId?: string;
  editor?: BinderEditorBridge;
  /** Shows a "Share this page" button; this is the footer line of the image (the site address). */
  shareFooter?: string;
}) {
  const { double, reduce } = usePrefs();
  const cfg = config;
  const cap = capacity(cfg);
  const custom = cfg.mode === 'custom' && cfg.pages.length > 0 && (cfg.pagesSeason ?? null) === (seasonId ?? null);
  const pages = useMemo(() => {
    if (custom) return buildCustomPages(cards, cfg.pages, cap);
    return buildBinderPages(cards.map(c => ({ packName: c.packName, number: c.number, stars: c.stars, name: c.name, owned: total(c.counts) > 0 })), { cap, sort: cfg.sort, group: cfg.groupByPack, hideUncollected: cfg.hideUncollected });
  }, [cards, custom, cfg.pages, cap, cfg.sort, cfg.groupByPack, cfg.hideUncollected]);
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
    if (!double || reduce || editor) { setSpread(target); return; }
    // The leaf turns over one spread at a time; a longer jump just lands on the target after turning once.
    setTurning({ dir: target > cur ? 1 : -1, to: target });
    timer.current = setTimeout(() => { setSpread(target); setTurning(null); }, TURN_MS);
  }, [cur, turning, double, reduce, editor, spreads.length]);

  // The editor asks to show a particular page (a new one, or the one being renamed).
  const focusN = editor?.focus?.n;
  const focusPage = editor?.focus?.page;
  useEffect(() => {
    if (focusN === undefined || focusPage === undefined) return;
    const idx = pages.findIndex(p => p.cfgIndex === focusPage);
    if (idx >= 0) { setTurning(null); setSpread(spreadOfPage(idx, double)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusN]);

  // Swipe (touch and pen): a mostly horizontal drag turns the page; a swipe never counts as a tap on the pocket underneath.
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiped = useRef(0);
  const onDown = (e: React.PointerEvent) => { if (e.pointerType !== 'mouse') swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; };
  const onUp = (e: React.PointerEvent) => {
    const s0 = swipe.current;
    swipe.current = null;
    if (!s0 || s0.id !== e.pointerId) return;
    const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swiped.current = Date.now();
    goTo(cur + (dx < 0 ? 1 : -1));
  };
  const swallowTap = (e: React.MouseEvent) => { if (Date.now() - swiped.current < 350) { e.preventDefault(); e.stopPropagation(); } };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(cur + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(cur - 1); }
  };

  const owned = cards.filter(c => total(c.counts) > 0).length;
  const packs = useMemo(() => pages.map((p, i) => ({ p, i })).filter(x => x.p.kind === 'cards' && (custom ? !!x.p.title : x.p.part === 1)).slice(0, 24), [pages, custom]);
  const cv = coverColour(cfg.cover);
  const pg = pageColour(cfg.pageColour);
  const title = cfg.title || `${ownerLabel} binder`;
  const gridStyle = { gridTemplateColumns: `repeat(${cfg.cols}, minmax(0, 1fr))` } as React.CSSProperties;

  const slotBody = (idx: number | null, pin: Variant | null, key: string, open: (el: HTMLElement | null) => void) =>
    idx === null ? <div key={key} className="bn-pocket bn-empty" aria-hidden /> : <Pocket key={key} card={cards[idx]} pin={pin} cfg={cfg} onOpen={open} />;

  const pageView = (p: BinderPage | undefined, side: 'left' | 'right') => {
    if (!p) return <div className="bn-page bn-blank" data-side={side} aria-hidden />;
    if (p.kind === 'cover') return (
      <div className="bn-page bn-cover" data-side={side}>
        {cfg.emblem !== 'none' && <Icon name={cfg.emblem as IconName} className="bn-cover-icon" />}
        <p className="bn-cover-title">{title}</p>
        <p className="bn-cover-sub">{cfg.subtitle || `${owned} of ${cards.length} cards collected`}</p>
        <p className="bn-cover-hint">{editor ? 'Pick a pocket, then a card' : double ? 'Press the right arrow or the page edge to open it' : 'Swipe or use the buttons to turn the page'}</p>
      </div>
    );
    const editing = editor && p.cfgIndex !== undefined;
    return (
      <div className="bn-page" data-side={side}>
        <p className="bn-head"><span>{custom ? (p.title || ' ') : p.pack}</span>{!custom && (p.parts ?? 1) > 1 && <span>{p.part}/{p.parts}</span>}</p>
        <div className="bn-grid" style={gridStyle}>
          {p.slots.map((idx, i) => {
            if (!editing) return slotBody(idx, p.pins?.[i] ?? null, `s${i}`, el => idx !== null && onOpen(idx, el));
            const sel = editor.selected?.page === p.cfgIndex && editor.selected?.slot === i;
            return (
              <div
                key={`s${i}`} className="bn-edit-slot" data-selected={sel} role="button" tabIndex={0}
                aria-label={idx === null ? `Empty pocket ${i + 1}` : `${cards[idx].name}, pocket ${i + 1}`} aria-pressed={sel}
                draggable={idx !== null}
                onDragStart={e => { e.dataTransfer.setData('text/plain', `slot:${p.cfgIndex}:${i}`); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.dataset.over = 'true'; }}
                onDragLeave={e => { delete e.currentTarget.dataset.over; }}
                onDrop={e => { e.preventDefault(); delete e.currentTarget.dataset.over; editor.onDrop(p.cfgIndex!, i, e.dataTransfer.getData('text/plain')); }}
                onClickCapture={e => { e.preventDefault(); e.stopPropagation(); editor.onSelect(p.cfgIndex!, i); }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editor.onSelect(p.cfgIndex!, i); } }}
              >
                {idx === null ? <div className="bn-pocket bn-empty bn-plus" aria-hidden><span>+</span></div> : slotBody(idx, p.pins?.[i] ?? null, `c${i}`, () => {})}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // A closed binder (the cover showing, two-page mode) is drawn as one page, like a closed book; opening and closing animate between the two.
  const state: 'open' | 'closed' | 'opening' | 'closing' = !double ? 'open' : turning ? (cur === 0 ? 'opening' : turning.to === 0 ? 'closing' : 'open') : cur === 0 ? 'closed' : 'open';
  const sp: Spread | undefined = spreads[cur];
  const next = turning ? spreads[turning.to] : undefined;
  let book: ReactNode;
  if (!double || !turning || !sp || !next) {
    book = (
      <div className={`bn-book ${double ? 'bn-double' : 'bn-single'}`} key={double ? 'd' : cur} data-fade={!double && !editor}>
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

  // The image for "Share this page": the pages in view drawn the way they look here (cover colour and material, page colour,
  // pocket style, grid size, how missing cards look), so it matches the customised binder.
  const shareSpec = useMemo<ShareSpec | null>(() => {
    if (!shareFooter || !sp) return null;
    const shown = [sp.left, sp.right].filter((p): p is BinderPage => !!p && p.kind === 'cards');
    if (!shown.length) return null;
    const pages: BinderSharePage[] = shown.map(p => ({
      title: custom ? p.title ?? '' : `${p.pack ?? ''}${(p.parts ?? 1) > 1 ? ` ${p.part}/${p.parts}` : ''}`,
      slots: p.slots.map((idx, i): BinderShareSlot | null => {
        if (idx === null) return null;
        const c = cards[idx];
        const pin = p.pins?.[i] ?? null;
        const have = pin ? c.counts[pin] : total(c.counts);
        const v: Variant = pin ?? bestOf(c.counts);
        const src = artOf(c, v);
        return { src, thumb: stillFor(c, src), name: c.name, number: c.number, hex: getRarity(c.stars)?.hex, owned: have > 0, count: have, tag: SHORT[v] || undefined, label: pin ? VARIANT_LABELS[pin] : undefined };
      }),
    }));
    if (!pages.some(pp => pp.slots.some(x => x?.owned))) return null; // nothing to show off on these pages
    const names = pages.map(pp => pp.title).filter(Boolean);
    return {
      title, subtitle: [...new Set(names)].join(' · ') || undefined, stats: [`${owned}/${cards.length} cards`], cards: [], footer: shareFooter, theme: cv.shareTheme,
      binder: { cols: cfg.cols, rows: cfg.rows, cover: { a: cv.a, b: cv.b, c: cv.c, ink: cv.ink }, material: cfg.material, page: { a: pg.a, b: pg.b, ink: pg.ink, muted: pg.muted, light: isLightColour(pg.a) }, pocket: cfg.pocketStyle, missing: cfg.missing, badges: cfg.badges, pages },
    };
  }, [shareFooter, sp, cards, custom, title, owned, cv, pg, cfg.cols, cfg.rows, cfg.material, cfg.pocketStyle, cfg.missing, cfg.badges]);

  const leatherStyle = {
    '--cv-a': cv.a, '--cv-b': cv.b, '--cv-c': cv.c, '--cv-ink': cv.ink,
    '--pg-a': pg.a, '--pg-b': pg.b, '--pg-ink': pg.ink, '--pg-muted': pg.muted,
    '--bn-cols': cfg.cols, '--bn-rows': cfg.rows,
  } as React.CSSProperties;

  return (
    <div className="space-y-3" onKeyDown={onKey}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Jump to a page">
          <button type="button" onClick={() => goTo(0)} className="bn-chip">Cover</button>
          {packs.map(({ p, i }) => <button key={`${p.pack}-${i}`} type="button" onClick={() => goTo(spreadOfPage(i, double))} className="bn-chip">{custom ? p.title : p.pack}</button>)}
        </div>
        <div className="flex items-center gap-3">
          {shareSpec && <ShareImageButton spec={shareSpec} filename="cheesy-tcg-binder.png" label="Share this page" />}
          <p className="text-xs text-gray-500" aria-live="polite">{sp?.label}</p>
        </div>
      </div>

      <div className="bn-drop" data-state={state}>
      <div className="bn-cover-wrap" data-state={state} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { swipe.current = null; }} onClickCapture={swallowTap} tabIndex={0} role="group" aria-label={`${title}. Use the left and right arrow keys to turn pages.`}>
        <div className="bn-leather" style={leatherStyle} data-material={cfg.material} data-pocket={cfg.pocketStyle} data-missing={cfg.missing}>
          {book}
          {double && <span aria-hidden className="bn-rings"><i /><i /><i /></span>}
        </div>
      </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={() => goTo(cur - 1)} disabled={cur <= 0 || !!turning} className="bn-nav" aria-label="Previous page"><Icon name="chevronLeft" /> Back</button>
        <button type="button" onClick={() => goTo(cur + 1)} disabled={cur >= spreads.length - 1 || !!turning} className="bn-nav" aria-label="Next page">Next <Icon name="chevronRight" /></button>
      </div>
    </div>
  );
}

function Pocket({ card, pin, cfg, onOpen }: { card: GridCard; pin: Variant | null; cfg: BinderConfig; onOpen: (el: HTMLElement | null) => void }) {
  const rarity = getRarity(card.stars);
  const have = pin ? card.counts[pin] : total(card.counts);
  if (have === 0) {
    const label = pin ? VARIANT_LABELS[pin] : '';
    const hint = `#${card.number} ${card.name}${label ? ` · ${label}` : ''} · not collected yet`;
    if (cfg.missing === 'blank') return <div className="bn-pocket bn-empty" title={hint} />;
    if (cfg.missing === 'ghost') {
      return (
        <div className="bn-pocket bn-missing bn-ghost" title={hint}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stillFor(card, artOf(card, pin ?? 'regular'))} alt="" loading="lazy" decoding="async" />
          <span className="bn-missing-no">#{card.number}</span>
        </div>
      );
    }
    return (
      <div className="bn-pocket bn-missing" title={hint}>
        <span className="bn-missing-no">#{card.number}</span>
        {cfg.missing === 'name' && <span className="bn-missing-name">{card.name}</span>}
        {label && <span className="bn-missing-name">{label}</span>}
      </div>
    );
  }
  const best: Variant = pin ?? bestOf(card.counts);
  const art = artOf(card, best);
  const className = `bn-pocket bn-owned ${cfg.holo ? `holo-hover ${holoClass(card.holo[best])}` : ''} ${best !== 'regular' ? `vfx-${best}` : ''}`;
  const style = { borderColor: rarity?.hex, ...(cfg.holo ? holoVars(card.holo[best]) : {}) } as React.CSSProperties;
  const badges = cfg.badges ? (
    <>
      {have > 1 && <span className="absolute top-1 left-1 bg-gray-950/85 border border-yellow-500/50 text-yellow-300 text-[10px] font-extrabold px-1.5 rounded-full leading-tight">×{have}</span>}
      {best !== 'regular' && <span className="absolute bottom-1 right-1 bg-gray-950/85 border border-fuchsia-400/50 text-fuchsia-200 text-[9px] font-extrabold px-1.5 rounded-full leading-tight">{SHORT[best]}</span>}
    </>
  ) : null;
  const title = `#${card.number} ${card.name}${best !== 'regular' ? ` · ${VARIANT_LABELS[best]}` : ''}${have > 1 ? ` · ×${have}` : ''}`;
  return art
    ? <CardTile imageUrl={art} still={stillFor(card, art)} alt={card.name} title={title} className={className} style={style} onActivate={onOpen}>{badges}</CardTile>
    : <div className={className} style={style} title={title} role="button" tabIndex={0} onClick={e => onOpen(e.currentTarget)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(e.currentTarget); } }}>{badges}</div>;
}
