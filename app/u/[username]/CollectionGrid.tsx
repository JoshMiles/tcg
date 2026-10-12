'use client';
import { Icon } from '@/app/components/Icon';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CardTile } from '@/app/components/CardTile';
import { SerialChip } from '@/app/components/SerialChip';
import { FlipCard } from '@/app/components/FlipCard';
import { engravedDate } from '@/lib/flip-back';
import { getRarity } from '@/lib/rarity';
import { cardThumbUrl } from '@/lib/card-art';
import { VARIANTS, VARIANT_LABELS, type VariantCounts } from '@/lib/variants';
import { holoClass, holoVars, type HoloSpecs } from '@/lib/holo-core';
import { UpgradeButton } from '@/app/components/UpgradeButton';
import { CardMathsPanel } from '@/app/components/CardMathsPanel';
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
  copies?: { id: string; variant: Variant; n: number; /** When it was made (ms), where it came from, and how many of its card and version exist: for the engraved back of the flip card. */ at?: number; origin?: string; made?: number; est?: boolean; /** Points multiplier when the number earns a bonus. */ m?: number; /** What this copy is worth. */ p?: number }[];
  /** The working behind this card's points, for the Advanced information panel. */
  maths?: CardMaths;
}

const SHORT: Record<Variant, string> = { regular: '', reverse: 'RH', full: 'FA', shiny: 'SH' };

const bestVariant = (c: VariantCounts): Variant => [...VARIANTS].reverse().find(v => c[v] > 0) ?? 'regular';
const totalCopies = (c: VariantCounts) => VARIANTS.reduce((s, v) => s + c[v], 0);
const artFor = (c: GridCard, v: Variant) => ((v === 'full' || v === 'shiny') && c.fullArtImageUrl ? c.fullArtImageUrl : c.imageUrl);
const oneIn = (p: number) => (p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()}` : '—');

export function CollectionGrid({ cards, totalScore, leaderboardHref, canUpgrade = false, ownerName, tradeWith, seasonId, defaultHide = true, compact = false, mine }: { /** The signed-in viewer's copies per card number, when looking at someone else's collection: switches on Compare. */ mine?: Record<number, number>; /** Needed for the serial links. */ seasonId?: string; /** The viewer's Settings: start with uncollected cards hidden (a choice made on the grid itself still wins). */ defaultHide?: boolean; /** The viewer's Settings: smaller tiles. */ compact?: boolean; cards: GridCard[]; totalScore: number; leaderboardHref: string; canUpgrade?: boolean; /** Whose collection this is, for wording when it isn't the viewer's own. */ ownerName?: string; /** Their login, when a logged-in viewer is looking at someone else's collection: adds the trade button. */ tradeWith?: string }) {
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

      <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filter the collection">
        <input type="search" value={view.q} onChange={e => patch({ q: e.target.value })} placeholder="Search name or #" aria-label="Search cards"
          className="min-w-0 flex-1 basis-40 rounded-xl bg-gray-950 border border-gray-700 focus:border-yellow-500 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none" />
        <select value={view.show} onChange={e => patch({ show: e.target.value as ShowFilter })} aria-label="Show" className="rounded-xl bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-gray-200">
          <option value="default">{hiding ? 'Collected' : 'Everything'}</option>
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
      </div>

      {uncollected > 0 && ownedIdx.length > 0 && view.show === 'default' && (
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

      <div className={compact ? 'grid grid-cols-4 sm:grid-cols-7 md:grid-cols-10 gap-2' : 'grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-3'}>
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
              <CardTile key={card.id} imageUrl={art} alt={card.name} title={title} className={tileClass} style={tileStyle} onActivate={el => open(idx, el)}>
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
      </div>

      {order.length === 0 && <p className="rind rounded-2xl p-6 text-center text-sm text-gray-400">No cards match. <button type="button" onClick={() => setView(DEFAULT_VIEW)} className="text-yellow-400 hover:text-yellow-300">Clear the filters</button></p>}

      {openIdx !== null && cards[openIdx] && (
        <CardDetail
          card={cards[openIdx]}
          totalScore={totalScore}
          leaderboardHref={leaderboardHref}
          canUpgrade={canUpgrade}
          ownerName={canUpgrade ? undefined : ownerName}
          tradeWith={tradeWith}
          seasonId={seasonId}
          canStep={ownedIdx.length > 1}
          onClose={close}
          onStep={step}
        />
      )}
    </>
  );
}

// ── Detail dialog ─────────────────────────────────────────

function CardDetail({
  card, totalScore, leaderboardHref, canUpgrade, ownerName, tradeWith, seasonId, canStep, onClose, onStep,
}: {
  card: GridCard; totalScore: number; leaderboardHref: string; canUpgrade: boolean; ownerName?: string; tradeWith?: string; seasonId?: string; canStep: boolean; onClose: () => void; onStep: (d: number) => void;
}) {
  const rarity = getRarity(card.stars);
  const [preview, setPreview] = useState<Variant | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  // Reset the previewed variant when moving to another card.
  useEffect(() => { setPreview(null); }, [card.id]);

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

  const best = bestVariant(card.counts);
  const shown = preview && card.counts[preview] > 0 ? preview : best;
  const rows = card.upgradable ? VARIANTS.filter(v => card.variants.includes(v) || card.counts[v] > 0) : (['regular'] as Variant[]);
  const showUpgrades = canUpgrade && card.upgradable;
  const cardTotal = VARIANTS.reduce((s, v) => s + card.counts[v] * card.values[v], 0) + card.serial.points;
  const share = totalScore > 0 ? Math.round((cardTotal / totalScore) * 100) : 0;

  const outThere = card.variantCopies[shown];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${card.name} details`}>
      <div className="absolute inset-0 bg-gray-950/85 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl max-h-full overflow-y-auto tcg-panel rounded-2xl shadow-glow">
        <button ref={closeBtn} onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-gray-900/80 text-gray-300 hover:text-white text-xl leading-none">×</button>

        <div className="grid md:grid-cols-[260px_1fr] gap-6 p-5 sm:p-6">
          {/* Art */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 w-full justify-center">
              {canStep && <button onClick={() => onStep(-1)} aria-label="Previous card" className="w-8 h-12 shrink-0 rounded-lg border border-gray-700 text-gray-400 hover:text-white">‹</button>}
              <div className="w-full max-w-[230px]">
                {(() => {
                  const art = (
                    <div
                      className={`relative w-full aspect-[2/3] rounded-xl overflow-hidden border-2 bg-gray-900 ${shown !== 'regular' ? `vfx-${shown}` : ''} ${holoClass(card.holo[shown], true)}`}
                      style={{
                        borderColor: rarity?.hex,
                        boxShadow: `0 0 24px -6px ${rarity?.hex}`,
                        ...holoVars(card.holo[shown]),
                        ['--art-mask' as string]: cardThumbUrl(artFor(card, shown)) !== artFor(card, shown) ? `url("${cardThumbUrl(artFor(card, shown))}")` : 'none',
                      } as React.CSSProperties}
                    >
                      <img src={cardThumbUrl(artFor(card, shown))} alt={card.name} className="w-full h-full object-cover" />
                      <FullArt url={artFor(card, shown)} />
                    </div>
                  );
                  // With numbered copies the card can be turned over: the back is the engraved serial of the lowest-numbered copy shown.
                  const copy = seasonId ? (card.copies ?? []).filter(c => c.variant === shown && c.at).sort((a, b) => a.n - b.n)[0] : undefined;
                  if (!copy || !copy.at) return art;
                  return (
                    <FlipCard
                      compact
                      back={{
                        n: copy.n, total: copy.made, variantLabel: VARIANT_LABELS[shown], name: card.name, date: engravedDate(copy.at), est: copy.est,
                        bonus: copy.m, hex: rarity?.hex, holder: ownerName ? `@${ownerName}` : 'you', href: `/copy/${encodeURIComponent(seasonId!)}/${copy.id}`,
                      }}
                    >{art}</FlipCard>
                  );
                })()}
              </div>
              {canStep && <button onClick={() => onStep(1)} aria-label="Next card" className="w-8 h-12 shrink-0 rounded-lg border border-gray-700 text-gray-400 hover:text-white">›</button>}
            </div>
            {card.upgradable && <p className="text-[11px] text-gray-500">Showing: {VARIANT_LABELS[shown]}</p>}
          </div>

          {/* Info */}
          <div className="space-y-4 min-w-0">
            <div>
              <p className="text-xs text-gray-500">#{card.number} · {card.packName}</p>
              <h2 className="font-display text-3xl font-bold text-white leading-tight break-words">{card.name}</h2>
              <p className="text-sm font-semibold mt-1" style={{ color: rarity?.hex }}>
                {'★'.repeat(card.stars)} {rarity?.label}
              </p>
            </div>

            {/* Value summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-950/60 border border-gray-800 p-3">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">{ownerName ? `${ownerName}’s copies are worth` : 'Your copies are worth'}</p>
                <p className="font-display text-3xl font-bold text-yellow-400 tabular-nums">{cardTotal.toLocaleString()}<span className="text-sm text-gray-500 ml-1">pts</span></p>
                {share > 0 && <p className="text-xs text-gray-500">{share}% of {ownerName ? `${ownerName}’s` : 'your'} card points</p>}
              </div>
              <div className="rounded-xl bg-gray-950/60 border border-gray-800 p-3">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Pull chance</p>
                <p className="font-display text-3xl font-bold text-white tabular-nums">{oneIn(card.pullRate)}</p>
                <p className="text-xs text-gray-500">per pack, before variants</p>
              </div>
            </div>

            {seasonId && card.copies && card.copies.length > 0 && <SerialList card={card} seasonId={seasonId} shown={shown} ownerName={ownerName} />}

            <p className="text-xs text-gray-500">
              {card.serial.points > 0 && <span className="text-emerald-300">Serial bonuses add +{card.serial.points.toLocaleString()} pts to this card. </span>}
              {(!card.copies || card.copies.length === 0) && card.serial.mult <= 1 && 'Low serial numbers earn a bonus; none of these copies qualify. '}
              {outThere.toLocaleString()} cop{outThere === 1 ? 'y' : 'ies'} of {VARIANT_LABELS[shown]} out there
            </p>

            {/* Per-variant table */}
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
                      <tr
                        key={v}
                        onClick={() => n > 0 && setPreview(v)}
                        className={`${n > 0 ? 'cursor-pointer hover:bg-white/[0.03]' : 'opacity-50'} ${v === shown && n > 0 ? 'bg-white/[0.04]' : ''}`}
                      >
                        <td className="py-2 px-3 text-gray-200">{VARIANT_LABELS[v]}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-gray-300">{n > 0 ? `×${n}` : '—'}</td>
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
              {canUpgrade && card.upgradable ? 'Upgrades are permanent: the copies you spend are destroyed. The newest serial numbers go first, so a copy with a low number is safe. ' : ''}Card values change as the season goes on; serial bonuses never do.{' '}
              <a href="/faq#points" className="text-yellow-500 hover:text-yellow-300">How are points worked out? →</a>
            </p>
          </div>
        </div>
      </div>
    </div>
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

/** The serial numbers of the copies shown in the dialog, right under the value summary: the number, its bonus and what that copy is worth, each opening the copy's page. The version on show comes first. */
function SerialList({ card, seasonId, shown, ownerName }: { card: GridCard; seasonId: string; shown: Variant; ownerName?: string }) {
  const [all, setAll] = useState(false);
  const list = [...(card.copies ?? [])].sort((a, b) => Number(b.variant === shown) - Number(a.variant === shown) || VARIANTS.indexOf(b.variant) - VARIANTS.indexOf(a.variant) || a.n - b.n);
  const visible = all ? list : list.slice(0, 5);
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">{ownerName ? `${ownerName}\u2019s serial numbers` : 'Your serial numbers'}</p>
        <p className="text-[11px] text-gray-500">{list.length} copy number{list.length === 1 ? '' : 's'}</p>
      </div>
      <ul className="grid gap-1.5">
        {visible.map(c => (
          <li key={c.id}>
            <a href={`/copy/${encodeURIComponent(seasonId)}/${c.id}`} title={c.est ? 'Numbered after the fact: the order within a version is an estimate. Open this copy and its history' : 'Open this copy and its history'}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 hover:border-yellow-500/60 transition-colors ${c.variant === shown ? 'border-gray-700 bg-gray-900/70' : 'border-gray-800/80'}`}>
              <SerialChip n={c.n} bonus={c.m} est={c.est} className="text-xs !px-2.5 !py-0.5" />
              <span className="flex-1 min-w-0 truncate text-sm text-gray-200">{VARIANT_LABELS[c.variant]}</span>
              {c.m ? <span className="text-xs font-bold text-yellow-300">×{c.m} bonus</span> : null}
              {c.p ? <span className="text-xs tabular-nums text-gray-400">{c.p.toLocaleString()} pts</span> : null}
              <span aria-hidden className="text-gray-600">›</span>
            </a>
          </li>
        ))}
      </ul>
      {list.length > 5 && <button type="button" onClick={() => setAll(v => !v)} className="text-xs text-yellow-400 hover:text-yellow-300">{all ? 'Show fewer' : `Show all ${list.length}`}</button>}
      <p className="text-[11px] text-gray-600">The first copies ever made of a card are worth extra points; the number counts per card and version.</p>
    </div>
  );
}
