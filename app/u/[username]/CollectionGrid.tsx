'use client';
import { Icon } from '@/app/components/Icon';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CardTile } from '@/app/components/CardTile';
import { SerialChip } from '@/app/components/SerialChip';
import type { CardBackStyle } from '@/lib/card-back';
import { CardDetail, artFor, bestVariant } from './CardDetail';
import { Binder } from './Binder';
import { BinderEditor } from './BinderEditor';
import { DEFAULT_BINDER, type BinderConfig } from '@/lib/binder-config';
import { getRarity } from '@/lib/rarity';
import { stillFor } from '@/lib/card-art';
import { VARIANTS, VARIANT_LABELS, type VariantCounts } from '@/lib/variants';
import { holoClass, holoVars, type HoloSpecs } from '@/lib/holo-core';
import type { CardMaths } from '@/lib/card-maths';
import type { UpgradeCosts, Variant } from '@/lib/types';
import { DEFAULT_VIEW, SHOW_LABELS, SORT_LABELS, applyView, compareCollections, packProgress, type ShowFilter, type SortKey, type ViewState } from '@/lib/collection-view';

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
  /** The designed back of this card's pack (absent = the classic plate), for the flip card in the dialog. */
  back?: CardBackStyle;
  /** This viewer's numbered copies of the card (only when the season's copies are tracked). */
  copies?: { id: string; /** Its unique number across the game. */ uid?: number; variant: Variant; n: number; /** When it was made (ms), where it came from, and how many of its card and version exist: for the engraved back of the flip card. */ at?: number; origin?: string; made?: number; est?: boolean; /** Points multiplier when the number earns a bonus. */ m?: number; /** What this copy is worth. */ p?: number; /** What happened to it since it was made (the last two events, worded), for the journey summary. */ j?: string[] }[];
  /** The working behind this card's points, for the Advanced information panel. */
  maths?: CardMaths;
}

const SHORT: Record<Variant, string> = { regular: '', reverse: 'RH', full: 'FA', shiny: 'SH' };

const totalCopies = (c: VariantCounts) => VARIANTS.reduce((s, v) => s + c[v], 0);

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
              <span className="mt-1.5 block h-1.5 rounded-full bg-gray-950 overflow-hidden"><span className="block h-full rounded-full bg-linear-to-r from-yellow-300 to-yellow-600" style={{ width: `${p.pct}%` }} /></span>
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
          className="min-w-0 flex-1 basis-40 rounded-xl bg-gray-950 border border-gray-700 focus:border-yellow-500 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-hidden" />
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
          const tileClass = `relative aspect-2/3 rounded-xl overflow-hidden group transition-transform ${
            isOwned ? 'holo-hover border-2 hover:-translate-y-1 cursor-pointer focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-yellow-400' : 'border border-dashed border-gray-700 bg-gray-900/40'
          }${isOwned && best !== 'regular' ? ` vfx-${best}` : ''}${isOwned ? ` ${holoClass(card.holo[best])}` : ''}`;
          const tileStyle = isOwned ? { borderColor: rarity?.hex, boxShadow: `0 0 14px -4px ${rarity?.hex}`, ...holoVars(card.holo[best]) } : undefined;
          const overlays = (
            <>
              <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
              {isOwned && lowest && <SerialChip n={lowest.n} bonus={lowest.m} est={lowest.est} className="absolute bottom-1 left-1 bg-gray-950/85 text-[9px]! px-1.5! py-0! leading-tight" />}
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
