'use client';
import { Icon } from '@/app/components/Icon';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CardTile } from '@/app/components/CardTile';
import { SerialChip } from '@/app/components/SerialChip';
import { FlipCard } from '@/app/components/FlipCard';
import { Binder } from './Binder';
import { BinderEditor } from './BinderEditor';
import { DEFAULT_BINDER, type BinderConfig } from '@/lib/binder-config';
import { engravedDate } from '@/lib/flip-back';
import { PinCopyButton } from '@/app/components/PinCopyButton';
import { FavouriteCopyButton } from '@/app/components/FavouriteCopyButton';
import { getRarity } from '@/lib/rarity';
import { cardThumbUrl, stillFor } from '@/lib/card-art';
import { VARIANTS, VARIANT_LABELS, type VariantCounts } from '@/lib/variants';
import { holoClass, holoVars, type HoloSpecs } from '@/lib/holo-core';
import { UpgradeButton } from '@/app/components/UpgradeButton';
import { CardMathsPanel } from '@/app/components/CardMathsPanel';
import type { CardMaths } from '@/lib/card-maths';
import type { UpgradeCosts, Variant } from '@/lib/types';
import { DEFAULT_VIEW, SHOW_LABELS, SORT_LABELS, applyView, compareCollections, copiesForDialog, packProgress, type ShowFilter, type SortKey, type ViewState } from '@/lib/collection-view';

/** Everything the grid and the card detail need, precomputed on the server. */
export interface GridCard {
  id: string;
  number: number;
  name: string;
  imageUrl: string;
  fullArtImageUrl?: string;
  stillUrl?: string;
  fullArtStillUrl?: string;
  stars: number;
  packName: string;
  /** Whether this card can be pulled / upgraded as variants. */
  upgradable: boolean;
  /** Chance that a single pull of the season is this card (before the variant roll). */
  pullRate: number;
  /** Chance of each variant per pull (pullRate × variant share). Only meaningful when `upgradable`. */
  variantOdds: Record<Variant, number>;
  /** How many of each variant this viewer owns. */
  counts: VariantCounts;
  /** Points per copy, per variant. */
  values: Record<Variant, number>;
  /** How many copies of each version exist across the whole season. */
  variantCopies: VariantCounts;
  /** Points this viewer's low serial numbers add to the card, the lowest serial they hold and its multiplier (1 = no bonus). */
  serial: { points: number; best?: number; mult: number };
  /** Copies needed for each upgrade step (used by the owner's Upgrade buttons). */
  costs: UpgradeCosts;
  /** The variants switched on for this card (Regular plus whatever its pack and the card allow). */
  variants: Variant[];
  /** Where an upgrade from each variant goes and what it costs (switched-off variants are skipped at the combined cost). */
  steps: Record<Variant, { to: Variant; cost: number } | null>;
  /** The holographic shimmer per variant, from the Overlay Editor's settings for this card's pack. */
  holo: HoloSpecs;
  /** This viewer's numbered copies of the card (only when the season's copies are tracked). */
  copies?: { id: string; /** Its unique number across the game. */ uid?: number; variant: Variant; n: number; /** When it was made (ms), where it came from, and how many of its card and version exist: for the engraved back of the flip card. */ at?: number; origin?: string; made?: number; est?: boolean; /** Points multiplier when the number earns a bonus. */ m?: number; /** What this copy is worth. */ p?: number; /** What happened to it since it was made (the last two events, worded), for the journey summary. */ j?: string[] }[];
  /** The working behind this card's points, for the Advanced information panel. */
  maths?: CardMaths;
}

const SHORT: Record<Variant, string> = { regular: '', reverse: 'RH', full: 'FA', shiny: 'SH' };

const bestVariant = (c: VariantCounts): Variant => [...VARIANTS].reverse().find(v => c[v] > 0) ?? 'regular';
const totalCopies = (c: VariantCounts) => VARIANTS.reduce((s, v) => s + c[v], 0);
const artFor = (c: GridCard, v: Variant) => ((v === 'full' || v === 'shiny') && c.fullArtImageUrl ? c.fullArtImageUrl : c.imageUrl);
const oneIn = (p: number) => (p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()}` : '-');

export function CollectionGrid({ cards, totalScore, leaderboardHref, canUpgrade = false, ownerName, tradeWith, seasonId, defaultHide = true, compact = false, mine, binderConfig, siteHost, pinnedUid, favouriteUids, defaultLayout = 'grid' }: { /** The owner's choice of view for visitors who have not picked one. */ defaultLayout?: 'grid' | 'binder'; /** Unique numbers of the owner's favourite prints (for the Favourite button and heart). */ favouriteUids?: number[]; /** The print the owner has pinned to their profile (for the Pin button). */ pinnedUid?: number; /** The owner's binder settings (their look and layout); null = the defaults. */ binderConfig?: BinderConfig | null; /** The site address for the binder page's share image. */ siteHost?: string; /** The signed-in viewer's copies per card number, when looking at someone else's collection: switches on Compare. */ mine?: Record<number, number>; /** Needed for the serial links. */ seasonId?: string; /** The viewer's Settings: start with uncollected cards hidden (a choice made on the grid itself still wins). */ defaultHide?: boolean; /** The viewer's Settings: smaller tiles. */ compact?: boolean; cards: GridCard[]; totalScore: number; leaderboardHref: string; canUpgrade?: boolean; /** Whose collection this is, for wording when it isn't the viewer's own. */ ownerName?: string; /** Their login, when a logged-in viewer is looking at someone else's collection: adds the trade button. */ tradeWith?: string }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  // Uncollected cards are hidden by default. Choosing "Show uncollected" is remembered on this device (read after mount;
  // the server renders the default so there's no flash of ? tiles).
  const [hideUncollected, setHideUncollected] = useState(defaultHide);
  useEffect(() => {
    try { const v = localStorage.getItem('tcg_hide_uncollected'); if (v === '0') setHideUncollected(false); else if (v === '1') setHideUncollected(true); } catch { /* storage unavailable */ }
  }, []);
  const toggleHide = () => setHideUncollected(h => {
    const next = !h;
    try { localStorage.setItem('tcg_hide_uncollected', next ? '1' : '0'); } catch { /* storage unavailable */ }
    return next;
  });
  const opener = useRef<HTMLElement | null>(null);

  // Grid or binder; remembered on this device (read after mount so the server render and first paint are the grid).
  // The owner picks the view visitors start in; a visitor's own earlier choice, or ?view=grid / ?view=binder, wins.
  const [layout, setLayout] = useState<'grid' | 'binder'>(defaultLayout);
  useEffect(() => {
    try {
      const asked = new URLSearchParams(window.location.search).get('view');
      const stored = localStorage.getItem('tcg_collection_layout');
      const pick = asked === 'grid' || asked === 'binder' ? asked : stored === 'grid' || stored === 'binder' ? stored : null;
      if (pick) setLayout(pick);
    } catch { /* storage unavailable */ }
  }, []);
  const chooseLayout = (l: 'grid' | 'binder') => { setLayout(l); try { localStorage.setItem('tcg_collection_layout', l); } catch { /* storage unavailable */ } };
  const binder = layout === 'binder';
  const [binderCfg, setBinderCfg] = useState<BinderConfig>(binderConfig ?? DEFAULT_BINDER);
  const [customising, setCustomising] = useState(false);
  const ownerLabel = ownerName ? `${ownerName}’s` : 'My';

  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const patch = (p: Partial<ViewState>) => setView(v => ({ ...v, ...p }));
  const filtering = view.show !== 'default' || view.q !== '' || view.stars !== 0 || view.pack !== '' || view.sort !== 'number' || view.dir !== 1;

  // Only collected cards open (uncollected ones stay a mystery).
  const ownedIdx = cards.map((c, i) => (totalCopies(c.counts) > 0 ? i : -1)).filter(i => i >= 0);
  const uncollected = cards.length - ownedIdx.length;
  // With nothing collected yet there's nothing to show, so the placeholders stay visible instead of an empty page.
  const hiding = hideUncollected && ownedIdx.length > 0;
  const order = applyView(cards, view, { hideUncollected: hiding, mine });
  const openable = order.filter(i => totalCopies(cards[i].counts) > 0);
  const progress = packProgress(cards);
  const cmp = mine ? compareCollections(cards, mine) : null;

  const open = (idx: number, el: HTMLElement | null) => { opener.current = el; setOpenIdx(idx); };
  const close = useCallback(() => {
    setOpenIdx(null);
    opener.current?.focus();
  }, []);
  const step = useCallback((delta: number) => {
    setOpenIdx(cur => {
      if (cur === null || openable.length === 0) return cur;
      const pos = openable.indexOf(cur);
      return openable[(pos + delta + openable.length) % openable.length];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openable.join(',')]);

  return (
    <>
      {progress.length > 1 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Progress by pack">
          {progress.map(p => (
            <button key={p.pack} type="button" onClick={() => patch({ pack: view.pack === p.pack ? '' : p.pack })} aria-pressed={view.pack === p.pack}
              className={`text-left rounded-xl border px-3 py-2 transition-colors ${view.pack === p.pack ? 'border-yellow-500 bg-yellow-500/10' : 'border-gray-800 bg-gray-900/40 hover:border-gray-600'}`}>
              <span className="flex items-baseline justify-between gap-2 text-xs"><span className="font-bold text-gray-200 truncate">{p.pack}</span><span className="tabular-nums text-gray-400">{p.owned}/{p.total}</span></span>
              <span className="mt-1.5 block h-1.5 rounded-full bg-gray-950 overflow-hidden"><span className="block h-full rounded-full bg-gradient-to-r from-yellow-300 to-yellow-600" style={{ width: `${p.pct}%` }} /></span>
            </button>
          ))}
        </div>
      )}

      {cmp && cmp.both > 0 && (
        <p className="text-xs text-gray-400 rounded-xl border border-purple-400/30 bg-purple-500/5 px-3 py-2">
          <Icon name="trade" className="mr-1.5 text-purple-300" />
          Compared with you: you both have <strong className="text-white">{cmp.shared}</strong> · {ownerName ?? 'they'} {ownerName ? 'has' : 'have'} <strong className="text-white">{cmp.theyHave}</strong> you lack · you have <strong className="text-white">{cmp.iHave}</strong> they lack.
          {cmp.theyHave > 0 && <> Use the filter to see which.</>}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {binder && canUpgrade && seasonId && !customising && (
          <button type="button" onClick={() => setCustomising(true)} className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs font-bold text-yellow-300 hover:bg-yellow-500/20"><Icon name="palette" />Customise binder</button>
        )}
        <div className="inline-flex rounded-full border border-gray-700 p-0.5 text-xs font-bold" role="group" aria-label="How to show the collection">
          {(['grid', 'binder'] as const).map(l => (
            <button key={l} type="button" aria-pressed={layout === l} onClick={() => chooseLayout(l)}
              className={`rounded-full px-3 py-1 transition-colors ${layout === l ? 'bg-yellow-500 text-gray-950' : 'text-gray-300 hover:text-white'}`}>
              <Icon name={l === 'grid' ? 'grid' : 'book'} className="mr-1" />{l === 'grid' ? 'Grid' : 'Binder'}
            </button>
          ))}
        </div>
      </div>

      {binder && (customising && canUpgrade && seasonId
        ? <BinderEditor visitorsBinder={defaultLayout === 'binder'} cards={cards} initial={binderCfg} seasonId={seasonId} ownerLabel={ownerLabel} onClose={saved => { if (saved) setBinderCfg(saved); setCustomising(false); }} />
        : <Binder cards={cards} ownerLabel={ownerLabel} onOpen={open} config={binderCfg} seasonId={seasonId} shareFooter={siteHost} />)}

      {!binder && <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filter the collection">
        <input type="search" value={view.q} onChange={e => patch({ q: e.target.value })} placeholder="Search name or #" aria-label="Search cards"
          className="min-w-0 flex-1 basis-40 rounded-xl bg-gray-950 border border-gray-700 focus:border-yellow-500 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none" />
        <select value={view.show} onChange={e => patch({ show: e.target.value as ShowFilter })} aria-label="Show" className="rounded-xl bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-gray-200">
          <option value="default">{hiding ? 'Default (collected)' : 'Default (everything)'}</option>
          <option value="all">Everything</option>
          <option value="owned">Collected only</option>
          <option value="missing">{SHOW_LABELS.missing}</option>
          <option value="dupes">{SHOW_LABELS.dupes}</option>
          <option value="versions">{SHOW_LABELS.versions}</option>
          {cmp && <><option value="theyHave">{SHOW_LABELS.theyHave}</option><option value="iHave">{SHOW_LABELS.iHave}</option><option value="shared">{SHOW_LABELS.shared}</option></>}
        </select>
        <select value={view.stars} onChange={e => patch({ stars: Number(e.target.value) })} aria-label="Rarity" className="rounded-xl bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-gray-200">
          <option value={0}>Any rarity</option>
          {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
        </select>
        <select value={view.sort} onChange={e => patch({ sort: e.target.value as SortKey })} aria-label="Sort by" className="rounded-xl bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-gray-200">
          {(Object.keys(SORT_LABELS) as SortKey[]).map(k => <option key={k} value={k}>Sort: {SORT_LABELS[k]}</option>)}
        </select>
        <button type="button" onClick={() => patch({ dir: view.dir === 1 ? -1 : 1 })} aria-label="Reverse the order" title="Reverse the order" className="rounded-xl border border-gray-700 px-2 py-1.5 text-gray-300 hover:text-white"><Icon name={view.dir === 1 ? 'arrowDown' : 'arrowUp'} /></button>
        {filtering && <button type="button" onClick={() => setView(DEFAULT_VIEW)} className="text-xs text-yellow-400 hover:text-yellow-300">Clear</button>}
      </div>}

      {!binder && uncollected > 0 && ownedIdx.length > 0 && view.show === 'default' && (
        <div className="flex items-center justify-between gap-3 pb-1">
          <p className="text-xs text-gray-500">
            {ownedIdx.length} collected · {uncollected} still to find
          </p>
          <button
            type="button"
            onClick={toggleHide}
            aria-pressed={hideUncollected}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
              hideUncollected ? 'bg-yellow-500 text-gray-950 border-yellow-500' : 'border-gray-700 text-gray-300 hover:text-white'
            }`}
          >
            {hideUncollected ? `Show uncollected (${uncollected})` : 'Hide uncollected'}
          </button>
        </div>
      )}

      {!binder && <div className={compact ? 'grid grid-cols-4 sm:grid-cols-7 md:grid-cols-10 gap-2' : 'grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-3'}>
        {order.map(idx => {
          const card = cards[idx];
          const count = totalCopies(card.counts);
          const isOwned = count > 0;
          const rarity = getRarity(card.stars);
          const best = bestVariant(card.counts);
          const art = artFor(card, best);
          // The lowest-numbered copy of the version shown on the tile.
          const lowest = (card.copies ?? []).filter(c => c.variant === best).sort((a, b) => a.n - b.n)[0];
          const variantSummary = VARIANTS.filter(v => v !== 'regular' && card.counts[v] > 0)
            .map(v => `${VARIANT_LABELS[v]} ×${card.counts[v]}`).join(', ');
          const title = isOwned
            ? `#${card.number} ${card.name} · ${'★'.repeat(card.stars)}${count > 1 ? ` · ×${count} pulls` : ''}${variantSummary ? ` · ${variantSummary}` : ''}`
            : `#${card.number} ???`;
          const tileClass = `relative aspect-[2/3] rounded-xl overflow-hidden group transition-transform ${
            isOwned ? 'holo-hover border-2 hover:-translate-y-1 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400' : 'border border-dashed border-gray-700 bg-gray-900/40'
          }${isOwned && best !== 'regular' ? ` vfx-${best}` : ''}${isOwned ? ` ${holoClass(card.holo[best])}` : ''}`;
          const tileStyle = isOwned ? { borderColor: rarity?.hex, boxShadow: `0 0 14px -4px ${rarity?.hex}`, ...holoVars(card.holo[best]) } : undefined;
          const overlays = (
            <>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-xs text-white truncate leading-none">{isOwned ? card.name : `#${card.number}`}</p>
              </div>
              {isOwned && <div className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ backgroundColor: rarity?.hex }} />}
              {isOwned && best !== 'regular' && (
                <div className="absolute bottom-1 right-1 bg-gray-950/85 border border-fuchsia-400/50 text-fuchsia-200 text-[9px] font-extrabold px-1.5 rounded-full leading-tight">
                  {SHORT[best]}
                </div>
              )}
              {count > 1 && (
                <div className="absolute top-1 left-1 bg-gray-950/85 border border-yellow-500/50 text-yellow-300 text-[10px] font-extrabold px-1.5 rounded-full leading-tight">
                  ×{count}
                </div>
              )}
              {isOwned && lowest && <SerialChip n={lowest.n} bonus={lowest.m} est={lowest.est} className="absolute bottom-1 left-1 bg-gray-950/85 !text-[9px] !px-1.5 !py-0 leading-tight" />}
            </>
          );

          if (isOwned && art) {
            return (
              <CardTile key={card.id} imageUrl={art} still={stillFor(card, art)} alt={card.name} title={title} className={tileClass} style={tileStyle} onActivate={el => open(idx, el)}>
                {overlays}
              </CardTile>
            );
          }
          return (
            <div
              key={card.id}
              title={title}
              className={tileClass}
              style={tileStyle}
              {...(isOwned ? { role: 'button', tabIndex: 0, onClick: (e: React.MouseEvent<HTMLElement>) => open(idx, e.currentTarget), onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(idx, e.currentTarget); } } } : {})}
            >
              <div className="w-full h-full bg-gray-900/60 flex items-center justify-center">
                {isOwned ? <span className="text-xs text-gray-500 font-bold">#{card.number}</span> : <span className="font-display text-gray-600 font-bold text-2xl">?</span>}
              </div>
              {overlays}
            </div>
          );
        })}
      </div>}

      {!binder && order.length === 0 && <p className="rind rounded-2xl p-6 text-center text-sm text-gray-400">No cards match. <button type="button" onClick={() => setView(DEFAULT_VIEW)} className="text-yellow-400 hover:text-yellow-300">Clear the filters</button></p>}

      {openIdx !== null && cards[openIdx] && (
        <CardDetail
          card={cards[openIdx]}
          totalScore={totalScore}
          canUpgrade={canUpgrade}
          ownerName={canUpgrade ? undefined : ownerName}
          tradeWith={tradeWith}
          seasonId={seasonId}
          pinnedUid={pinnedUid} favouriteUids={favouriteUids}
          canStep={ownedIdx.length > 1}
          onClose={close}
          onStep={step}
        />
      )}
    </>
  );
}

// ── Detail dialog ─────────────────────────────────────────

type DialogCopy = NonNullable<GridCard['copies']>[number];
const printHref = (seasonId: string, c: DialogCopy) => `/copy/${encodeURIComponent(seasonId)}/${c.id}`;

/** The dialog for one card: first its prints (one tile each), then one print's details. A card with a single print opens on that print. */
function CardDetail({
  card, totalScore, canUpgrade, ownerName, tradeWith, seasonId, pinnedUid, favouriteUids, canStep, onClose, onStep,
}: {
  card: GridCard; totalScore: number; canUpgrade: boolean; ownerName?: string; tradeWith?: string; seasonId?: string; pinnedUid?: number; favouriteUids?: number[]; canStep: boolean; onClose: () => void; onStep: (d: number) => void;
}) {
  const rarity = getRarity(card.stars);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [printId, setPrintId] = useState<string | null>(null);

  const dialog = copiesForDialog(seasonId ? card.copies : undefined, card.counts, showAll ? Infinity : 60);
  const print = dialog.only ?? (printId ? (card.copies ?? []).find(c => c.id === printId) ?? null : null);

  // Back to the prints when moving to another card.
  useEffect(() => { setPrintId(null); setShowAll(false); }, [card.id]);

  useEffect(() => {
    closeBtn.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onStep(-1);
      else if (e.key === 'ArrowRight') onStep(1);
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prevOverflow; window.removeEventListener('keydown', onKey); };
  }, [onClose, onStep]);

  const total = dialog.total;
  const best = bestVariant(card.counts);
  const label = print ? `${card.name}, ${VARIANT_LABELS[print.variant]} edition #${print.n}` : `${card.name} details`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-gray-950/85 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl max-h-full overflow-y-auto tcg-panel rounded-2xl shadow-glow">
        <button ref={closeBtn} onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-gray-900/80 text-gray-300 hover:text-white text-xl leading-none">×</button>

        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex items-start gap-2 pr-10">
            {canStep && <button onClick={() => onStep(-1)} aria-label="Previous card" className="w-8 h-10 shrink-0 rounded-lg border border-gray-700 text-gray-400 hover:text-white">‹</button>}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500">#{card.number} · {card.packName}</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight break-words">{card.name}</h2>
              <p className="text-sm font-semibold mt-1" style={{ color: rarity?.hex }}>
                {'★'.repeat(card.stars)} {rarity?.label}
                <span className="ml-2 text-gray-400 font-normal">{total.toLocaleString()} print{total === 1 ? '' : 's'}</span>
              </p>
            </div>
            {canStep && <button onClick={() => onStep(1)} aria-label="Next card" className="w-8 h-10 shrink-0 rounded-lg border border-gray-700 text-gray-400 hover:text-white">›</button>}
          </div>

          {print && seasonId
            ? <PrintView card={card} print={print} seasonId={seasonId} ownerName={ownerName} canUpgrade={canUpgrade} tradeWith={tradeWith} pinnedUid={pinnedUid} favouriteUids={favouriteUids} onBack={dialog.only ? undefined : () => setPrintId(null)} />
            : <PrintsView card={card} dialog={dialog} seasonId={seasonId} onPick={setPrintId} showAll={() => setShowAll(true)} />}

          <CardInfo card={card} totalScore={totalScore} canUpgrade={canUpgrade} ownerName={ownerName} tradeWith={print ? undefined : tradeWith} shown={print?.variant ?? best} />
        </div>
      </div>
    </div>
  );
}

/** Step 1: one small tile per print, grouped by version (or one tile per version with its count when prints are not tracked). */
function PrintsView({ card, dialog, seasonId, onPick, showAll }: { card: GridCard; dialog: ReturnType<typeof copiesForDialog<DialogCopy>>; seasonId?: string; onPick: (id: string) => void; showAll: () => void }) {
  const rarity = getRarity(card.stars);
  const tileStyle = (v: Variant) => ({ borderColor: rarity?.hex, ...holoVars(card.holo[v]) } as React.CSSProperties);
  const tileClass = (v: Variant) => `relative aspect-[2/3] w-full rounded-lg overflow-hidden border-2 bg-gray-900 ${v !== 'regular' ? `vfx-${v} ` : ''}${holoClass(card.holo[v])}`;
  const art = (v: Variant) => <img src={stillFor(card, artFor(card, v))} alt="" loading="lazy" className="w-full h-full object-cover" />;
  return (
    <div className="space-y-4">
      {dialog.groups.map(g => (
        <section key={g.variant} aria-label={`${VARIANT_LABELS[g.variant]} prints`}>
          <h3 className="text-[11px] uppercase tracking-wider text-gray-400 font-bold mb-2">{VARIANT_LABELS[g.variant]} <span className="text-gray-600 normal-case tracking-normal">×{g.count}</span></h3>
          {dialog.tracked ? (
            <ul className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 gap-2">
              {g.copies.map(c => (
                <li key={c.id} className="min-w-0">
                  <button type="button" onClick={() => onPick(c.id)} aria-label={`${VARIANT_LABELS[g.variant]} edition #${c.n}${c.uid ? `, print number ${c.uid}` : ''}${c.m ? ', edition bonus' : ''}`}
                    className="group block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400 rounded-lg">
                    <span className={`${tileClass(g.variant)} block transition-transform group-hover:-translate-y-0.5`} style={tileStyle(g.variant)}>{art(g.variant)}</span>
                    <span className="mt-1 flex items-center gap-1 min-w-0">
                      <SerialChip n={c.n} bonus={c.m} est={c.est} className="!text-[10px] !px-1.5 !py-0" />
                    </span>
                    {c.uid ? <span className="block truncate text-[10px] text-gray-500 tabular-nums">Print #{c.uid}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="w-24 sm:w-28">
              <span className={`${tileClass(g.variant)} block`} style={tileStyle(g.variant)}>{art(g.variant)}
                <span className="absolute top-1 left-1 bg-gray-950/85 border border-yellow-500/50 text-yellow-300 text-[10px] font-extrabold px-1.5 rounded-full leading-tight">×{g.count}</span>
              </span>
            </div>
          )}
        </section>
      ))}
      {dialog.more > 0 && <button type="button" onClick={showAll} className="text-xs text-yellow-400 hover:text-yellow-300">Show all {dialog.total.toLocaleString()}</button>}
      {seasonId && dialog.tracked && <p className="text-[11px] text-gray-600">Choose a print to see its edition, print number, points and history. The first prints ever made of a card are worth extra points.</p>}
      {!dialog.tracked && <p className="text-[11px] text-gray-600">This season does not number its prints, so each version shows as one tile.</p>}
    </div>
  );
}

const pill = 'inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 border text-gray-200 bg-white/[0.06] border-white/10 hover:bg-white/10';

/** Step 2: one print, turned over on the flip card, with what it is worth and where it has been. */
function PrintView({ card, print, seasonId, ownerName, canUpgrade, tradeWith, pinnedUid, favouriteUids, onBack }: { card: GridCard; print: DialogCopy; seasonId: string; ownerName?: string; canUpgrade: boolean; tradeWith?: string; pinnedUid?: number; favouriteUids?: number[]; onBack?: () => void }) {
  const rarity = getRarity(card.stars);
  const v = print.variant;
  const href = printHref(seasonId, print);
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}${href}`;
    try {
      if (navigator.share) { await navigator.share({ title: `${card.name}${print.uid ? ` #${print.uid}` : ''}`, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* cancelled or blocked */ }
  };
  const art = artFor(card, v);
  const face = (
    <div
      className={`relative w-full aspect-[2/3] rounded-xl overflow-hidden border-2 bg-gray-900 ${v !== 'regular' ? `vfx-${v}` : ''} ${holoClass(card.holo[v], true)}`}
      style={{
        borderColor: rarity?.hex, boxShadow: `0 0 24px -6px ${rarity?.hex}`, ...holoVars(card.holo[v]),
        ['--art-mask' as string]: cardThumbUrl(art) !== art ? `url("${stillFor(card, art)}")` : 'none',
      } as React.CSSProperties}
    >
      <img src={stillFor(card, art)} alt={`${VARIANT_LABELS[v]} ${card.name}`} className="w-full h-full object-cover" />
      <FullArt url={art} />
    </div>
  );
  // The first line is how it began (origin and date); the rest are what happened since, at most three lines in all.
  const journey = [`${print.origin ?? 'Made'}${print.at ? `, ${engravedDate(print.at)}` : ''}`, ...(print.j ?? [])].slice(0, 3);
  const step = card.steps[v];
  const showUpgrade = canUpgrade && card.upgradable && step && card.counts[v] > 0;
  return (
    <div className="space-y-4">
      {onBack && <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-bold text-yellow-400 hover:text-yellow-300">‹ Back to all prints</button>}
      <div className="grid sm:grid-cols-[220px_1fr] gap-5">
        <div className="mx-auto w-full max-w-[220px]">
          {print.at
            ? <FlipCard compact back={{ n: print.n, uid: print.uid, total: print.made, variantLabel: VARIANT_LABELS[v], name: card.name, date: engravedDate(print.at), est: print.est, bonus: print.m, hex: rarity?.hex, holder: ownerName ? `@${ownerName}` : 'you', href }}>{face}</FlipCard>
            : face}
        </div>
        <div className="space-y-3 min-w-0">
          <div>
            <p className="font-display text-xl font-bold text-white">{VARIANT_LABELS[v]} {card.name}</p>
            <p className="text-sm text-gray-300 mt-0.5">Edition <strong className="text-white tabular-nums">#{print.n}</strong>{print.made && print.made >= print.n ? <> of {print.made.toLocaleString()} made</> : null}{print.est && <span className="ml-2 text-[10px] font-extrabold uppercase tracking-wider rounded-full px-2 py-0.5 border border-amber-400/40 text-amber-300 bg-amber-500/10">estimated number</span>}</p>
            {print.uid ? <p className="text-sm text-gray-400 tabular-nums">Print #{print.uid}</p> : null}
          </div>
          <div className={`rounded-xl border p-3 flex flex-wrap items-center gap-x-3 gap-y-1 ${print.m ? 'border-yellow-500/50 bg-yellow-500/[0.07]' : 'border-gray-800 bg-gray-950/60'}`}>
            <SerialChip n={print.n} bonus={print.m} est={print.est} className="text-sm !px-3 !py-1" />
            <span className="text-sm text-gray-200">Worth <strong className="text-white tabular-nums">{(print.p ?? card.values[v]).toLocaleString()} pts</strong></span>
            <span className="text-xs text-gray-500">{print.m ? `Edition bonus ×${print.m}` : 'No edition bonus'}</span>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-bold mb-1">Journey</p>
            <ol className="space-y-0.5 text-sm text-gray-300">{journey.map((t, i) => <li key={i} className="flex gap-2"><span aria-hidden className="text-gray-600">•</span>{t}</li>)}</ol>
          </div>
          <div className="flex flex-wrap items-start gap-2 pt-1">
            <a href={href} className={pill}>Open print page</a>
            <button type="button" onClick={share} className={pill}><Icon name="share" />{copied ? 'Link copied' : 'Share this print'}</button>
            {canUpgrade && print.uid ? <PinCopyButton uid={print.uid} pinned={pinnedUid === print.uid} /> : null}
            {canUpgrade && print.uid ? <FavouriteCopyButton uid={print.uid} favourite={!!favouriteUids?.includes(print.uid)} /> : null}
            {tradeWith && <a href={`/trade/new?to=${encodeURIComponent(tradeWith)}&want=${card.number}.${v}`} className="inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 border border-purple-400/40 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20"><Icon name="trade" />Offer a trade</a>}
          </div>
          {showUpgrade && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <UpgradeButton cardNumber={card.number} from={v} to={step!.to} have={card.counts[v]} cost={step!.cost} holo={card.holo} card={{ name: card.name, imageUrl: card.imageUrl, fullArtImageUrl: card.fullArtImageUrl }} />
              <span>Upgrades spend your newest prints first.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The card-level information, tucked under a disclosure: value, pull chance, per-version odds, the working. */
function CardInfo({ card, totalScore, canUpgrade, ownerName, tradeWith, shown }: { card: GridCard; totalScore: number; canUpgrade: boolean; ownerName?: string; tradeWith?: string; shown: Variant }) {
  const rows = card.upgradable ? VARIANTS.filter(v => card.variants.includes(v) || card.counts[v] > 0) : (['regular'] as Variant[]);
  const showUpgrades = canUpgrade && card.upgradable;
  const cardTotal = VARIANTS.reduce((s, v) => s + card.counts[v] * card.values[v], 0) + card.serial.points;
  const share = totalScore > 0 ? Math.round((cardTotal / totalScore) * 100) : 0;
  const outThere = card.variantCopies[shown];
  return (
    <details className="group rounded-xl border border-gray-800 bg-gray-950/40">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-bold text-yellow-300 hover:text-yellow-200">Card details</summary>
      <div className="space-y-4 px-4 pb-4 min-w-0">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-gray-950/60 border border-gray-800 p-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">{ownerName ? `${ownerName}’s prints are worth` : 'Your prints are worth'}</p>
            <p className="font-display text-3xl font-bold text-yellow-400 tabular-nums">{cardTotal.toLocaleString()}<span className="text-sm text-gray-500 ml-1">pts</span></p>
            {share > 0 && <p className="text-xs text-gray-500">{share}% of {ownerName ? `${ownerName}’s` : 'your'} card points</p>}
          </div>
          <div className="rounded-xl bg-gray-950/60 border border-gray-800 p-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Pull chance</p>
            <p className="font-display text-3xl font-bold text-white tabular-nums">{oneIn(card.pullRate)}</p>
            <p className="text-xs text-gray-500">per pack, before versions</p>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          {card.serial.points > 0 && <span className="text-emerald-300">Edition bonuses add +{card.serial.points.toLocaleString()} pts to this card. </span>}
          {(!card.copies || card.copies.length === 0) && card.serial.mult <= 1 && 'Low edition numbers earn a bonus; none of these prints qualify. '}
          {outThere.toLocaleString()} print{outThere === 1 ? '' : 's'} of {VARIANT_LABELS[shown]} out there
        </p>

        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 text-left bg-gray-950/50">
                <th className="py-2 px-3 font-bold">Version</th>
                <th className="py-2 px-2 font-bold text-right">{ownerName ? 'Owned' : 'You own'}</th>
                {card.upgradable && <th className="py-2 px-2 font-bold text-right hidden sm:table-cell">Pull odds</th>}
                <th className="py-2 px-2 font-bold text-right hidden sm:table-cell">Out there</th>
                <th className="py-2 px-3 font-bold text-right">Each is worth</th>
                {showUpgrades && <th className="py-2 px-3 font-bold text-right">Upgrade</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/70">
              {rows.map(v => {
                const n = card.counts[v];
                return (
                  <tr key={v} className={n > 0 ? '' : 'opacity-50'}>
                    <td className="py-2 px-3 text-gray-200">{VARIANT_LABELS[v]}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-gray-300">{n > 0 ? `×${n}` : '-'}</td>
                    {card.upgradable && <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap text-gray-500 hidden sm:table-cell">{oneIn(card.variantOdds[v])}</td>}
                    <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap text-gray-500 hidden sm:table-cell">{card.variantCopies[v].toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap font-semibold text-yellow-300">{card.values[v].toLocaleString()} pts</td>
                    {showUpgrades && (
                      <td className="py-2 px-3 text-right">
                        {card.steps[v] && n > 0 ? (
                          <UpgradeButton cardNumber={card.number} from={v} to={card.steps[v]!.to} have={n} cost={card.steps[v]!.cost} holo={card.holo} card={{ name: card.name, imageUrl: card.imageUrl, fullArtImageUrl: card.fullArtImageUrl }} />
                        ) : null}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {tradeWith && (
          <a
            href={`/trade/new?to=${encodeURIComponent(tradeWith)}&want=${card.number}.${shown}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-purple-400/40 bg-purple-500/10 hover:bg-purple-500/20 px-4 py-3 transition-colors"
          >
            <span className="text-sm font-bold text-purple-200"><Icon name="trade" className="mr-2" />Offer a trade for {card.upgradable && shown !== 'regular' ? `this ${VARIANT_LABELS[shown]}` : 'this card'}</span>
            <span className="text-xs text-purple-300/80">Set up an offer to {ownerName ?? tradeWith} →</span>
          </a>
        )}

        {card.maths && <CardMathsPanel maths={card.maths} variants={rows} shown={shown} />}

        <p className="text-xs text-gray-500">
          {canUpgrade && card.upgradable ? 'Upgrades are permanent: the prints you spend are destroyed. The newest edition numbers go first, so a print with a low number is safe. ' : ''}Card values change as the season goes on; edition bonuses never do.{' '}
          <a href="/faq#points" className="text-yellow-500 hover:text-yellow-300">How are points worked out? →</a>
        </p>
      </div>
    </details>
  );
}

/** The animated full-resolution art, faded in over the thumbnail once loaded. */
function FullArt({ url }: { url: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(false); }, [url]);
  if (cardThumbUrl(url) === url) return null; // no separate thumbnail → the image above is already the full one
  return (
    <img
      src={url}
      alt=""
      aria-hidden
      onLoad={() => setReady(true)}
      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${ready ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}
