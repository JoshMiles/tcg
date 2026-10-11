'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CardTile } from '@/app/components/CardTile';
import { getRarity } from '@/lib/rarity';
import { cardThumbUrl } from '@/lib/card-art';
import { VARIANTS, VARIANT_LABELS, type VariantCounts } from '@/lib/variants';
import type { Variant } from '@/lib/types';

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
  /** How many copies of this card exist across the whole season, and the resulting value factor (0.5–2). */
  copies: number;
  scarcity: number;
}

const SHORT: Record<Variant, string> = { regular: '', reverse: 'RH', full: 'FA', shiny: '✨' };

const bestVariant = (c: VariantCounts): Variant => [...VARIANTS].reverse().find(v => c[v] > 0) ?? 'regular';
const totalCopies = (c: VariantCounts) => VARIANTS.reduce((s, v) => s + c[v], 0);
const artFor = (c: GridCard, v: Variant) => ((v === 'full' || v === 'shiny') && c.fullArtImageUrl ? c.fullArtImageUrl : c.imageUrl);
const oneIn = (p: number) => (p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()}` : '—');

export function CollectionGrid({ cards, totalScore, leaderboardHref }: { cards: GridCard[]; totalScore: number; leaderboardHref: string }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  // Only collected cards open (uncollected ones stay a mystery).
  const ownedIdx = cards.map((c, i) => (totalCopies(c.counts) > 0 ? i : -1)).filter(i => i >= 0);

  const open = (idx: number, el: HTMLElement | null) => { opener.current = el; setOpenIdx(idx); };
  const close = useCallback(() => {
    setOpenIdx(null);
    opener.current?.focus();
  }, []);
  const step = useCallback((delta: number) => {
    setOpenIdx(cur => {
      if (cur === null || ownedIdx.length === 0) return cur;
      const pos = ownedIdx.indexOf(cur);
      return ownedIdx[(pos + delta + ownedIdx.length) % ownedIdx.length];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedIdx.join(',')]);

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-3">
        {cards.map((card, idx) => {
          const count = totalCopies(card.counts);
          const isOwned = count > 0;
          const rarity = getRarity(card.stars);
          const best = bestVariant(card.counts);
          const art = artFor(card, best);
          const variantSummary = VARIANTS.filter(v => v !== 'regular' && card.counts[v] > 0)
            .map(v => `${VARIANT_LABELS[v]} ×${card.counts[v]}`).join(', ');
          const title = isOwned
            ? `#${card.number} ${card.name} · ${'★'.repeat(card.stars)}${count > 1 ? ` · ×${count} pulls` : ''}${variantSummary ? ` · ${variantSummary}` : ''}`
            : `#${card.number} ???`;
          const tileClass = `relative aspect-[2/3] rounded-xl overflow-hidden group transition-transform ${
            isOwned ? 'holo-hover border-2 hover:-translate-y-1 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400' : 'border border-dashed border-gray-700 bg-gray-900/40'
          }${isOwned && best !== 'regular' ? ` vfx-${best}` : ''}`;
          const tileStyle = isOwned ? { borderColor: rarity?.hex, boxShadow: `0 0 14px -4px ${rarity?.hex}` } : undefined;
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

      {openIdx !== null && cards[openIdx] && (
        <CardDetail
          card={cards[openIdx]}
          totalScore={totalScore}
          leaderboardHref={leaderboardHref}
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
  card, totalScore, leaderboardHref, canStep, onClose, onStep,
}: {
  card: GridCard; totalScore: number; leaderboardHref: string; canStep: boolean; onClose: () => void; onStep: (d: number) => void;
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
  const rows = card.upgradable ? VARIANTS : (['regular'] as Variant[]);
  const cardTotal = VARIANTS.reduce((s, v) => s + card.counts[v] * card.values[v], 0);
  const share = totalScore > 0 ? Math.round((cardTotal / totalScore) * 100) : 0;

  const scarcityLabel =
    card.scarcity >= 1.25 ? { text: 'Scarce — few copies exist this season, which boosts its value', cls: 'text-emerald-300' }
    : card.scarcity <= 0.8 ? { text: 'Common — lots of copies exist this season, which lowers its value', cls: 'text-gray-400' }
    : { text: 'About an average number of copies exist this season', cls: 'text-gray-300' };

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
              <div
                className={`relative w-full max-w-[230px] aspect-[2/3] rounded-xl overflow-hidden border-2 bg-gray-900 ${shown !== 'regular' ? `vfx-${shown}` : ''}`}
                style={{ borderColor: rarity?.hex, boxShadow: `0 0 24px -6px ${rarity?.hex}` }}
              >
                <img src={cardThumbUrl(artFor(card, shown))} alt={card.name} className="w-full h-full object-cover" />
                <FullArt url={artFor(card, shown)} />
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
                <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Your copies are worth</p>
                <p className="font-display text-3xl font-bold text-yellow-400 tabular-nums">{cardTotal.toLocaleString()}<span className="text-sm text-gray-500 ml-1">pts</span></p>
                {share > 0 && <p className="text-xs text-gray-500">{share}% of your total</p>}
              </div>
              <div className="rounded-xl bg-gray-950/60 border border-gray-800 p-3">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Pull chance</p>
                <p className="font-display text-3xl font-bold text-white tabular-nums">{oneIn(card.pullRate)}</p>
                <p className="text-xs text-gray-500">per pack, before variants</p>
              </div>
            </div>

            <p className={`text-xs ${scarcityLabel.cls}`}>
              {scarcityLabel.text} <span className="text-gray-500">(×{card.scarcity.toFixed(2)}, {card.copies.toLocaleString()} cop{card.copies === 1 ? 'y' : 'ies'} out there)</span>
            </p>

            {/* Per-variant table */}
            <div className="rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-gray-500 text-left bg-gray-950/50">
                    <th className="py-2 px-3 font-bold">Version</th>
                    <th className="py-2 px-2 font-bold text-right">You own</th>
                    {card.upgradable && <th className="py-2 px-2 font-bold text-right hidden sm:table-cell">Pull odds</th>}
                    <th className="py-2 px-3 font-bold text-right">Each is worth</th>
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
                        {card.upgradable && <td className="py-2 px-2 text-right tabular-nums text-gray-500 hidden sm:table-cell">{oneIn(card.variantOdds[v])}</td>}
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-yellow-300">{card.values[v].toLocaleString()} pts</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-500">
              Values change as more cards are pulled this season.{' '}
              <a href={`${leaderboardHref}?how=1`} className="text-yellow-500 hover:text-yellow-300">How are points worked out? →</a>
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
