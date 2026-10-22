'use client';
import { Icon } from '@/app/components/Icon';
import { SheetHandle } from '@/app/components/site/BottomSheet';
import { useSwipe } from '@/app/components/site/useSwipe';
import { InfoTip } from '@/app/components/InfoTip';
import { useEffect, useRef, useState } from 'react';
import { SerialChip } from '@/app/components/SerialChip';
import { FlipCard } from '@/app/components/FlipCard';
import { engravedDate, flipBackFor } from '@/lib/flip-back';
import { PinCopyButton } from '@/app/components/PinCopyButton';
import { FavouriteCopyButton } from '@/app/components/FavouriteCopyButton';
import { getRarity } from '@/lib/rarity';
import { cardThumbUrl, stillFor } from '@/lib/card-art';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import { holoClass, holoVars } from '@/lib/holo-core';
import { UpgradeButton } from '@/app/components/UpgradeButton';
import { UseTrainerButton } from '@/app/components/UseTrainerButton';
import { CardMathsPanel } from '@/app/components/CardMathsPanel';
import type { Variant } from '@/lib/types';
import { copiesForDialog } from '@/lib/collection-view';
import { artFor, bestVariant, type GridCard } from './CollectionGrid';

const oneIn = (p: number) => (p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()}` : '-');

// ── Detail dialog ─────────────────────────────────────────

export type DialogCopy = NonNullable<GridCard['copies']>[number];
const printHref = (seasonId: string, c: DialogCopy) => `/copy/${encodeURIComponent(seasonId)}/${c.id}`;

/** The dialog for one card: first its prints (one tile each), then one print's details. A card with a single edition opens on that edition. */
export function CardDetail({
  card, totalScore, canUpgrade, ownerName, tradeWith, seasonId, pinnedUid, favouriteUids, canStep, onClose, onStep,
}: {
  card: GridCard; totalScore: number; canUpgrade: boolean; ownerName?: string; tradeWith?: string; seasonId?: string; pinnedUid?: number; favouriteUids?: number[]; canStep: boolean; onClose: () => void; onStep: (d: number) => void;
}) {
  const rarity = getRarity(card.stars);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [printId, setPrintId] = useState<string | null>(null);

  const dialog = copiesForDialog(seasonId ? card.copies : undefined, card.counts, showAll ? Infinity : 60);
  const edition = dialog.only ?? (printId ? (card.copies ?? []).find(c => c.id === printId) ?? null : null);

  // Back to the editions when moving to another card.
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

  const swipe = useSwipe(d => { if (canStep) onStep(d); });
  const total = dialog.total;
  const best = bestVariant(card.counts);
  const label = edition ? `${card.name}, ${VARIANT_LABELS[edition.variant]} edition #${edition.n}` : `${card.name} details`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 safe-inset max-md:items-end max-md:p-0!" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-gray-950/85 backdrop-blur-xs" onClick={onClose} />

      <div {...swipe} className="card sheet-mobile relative w-full max-w-3xl max-h-full overflow-y-auto rounded-2xl shadow-glow max-md:max-w-none max-md:max-h-[90dvh] max-md:rounded-b-none! max-md:pb-[env(safe-area-inset-bottom)]">
        <SheetHandle onClose={onClose} className="sticky top-0 z-20 md:hidden bg-gray-950/90 rounded-t-2xl" />
        <button ref={closeBtn} onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-gray-900/80 text-gray-300 hover:text-white text-xl leading-none">×</button>

        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex items-start gap-2 pr-10">
            {canStep && <button onClick={() => onStep(-1)} aria-label="Previous card" className="w-8 h-10 shrink-0 rounded-lg border border-gray-700 text-gray-400 hover:text-white">‹</button>}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500">#{card.number} · {card.packName}</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight wrap-break-word">{card.name}</h2>
              <p className="text-sm font-semibold mt-1" style={{ color: rarity?.hex }}>
                {'★'.repeat(card.stars)} {rarity?.label}
                {card.kind === 'trainer' ? <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"><Icon name="zap" className="w-3 h-3" />Trainer</span> : null}
                <span className="ml-2 text-gray-400 font-normal">{total.toLocaleString()} pull{total === 1 ? '' : 's'}</span>
              </p>
            </div>
            {canStep && <button onClick={() => onStep(1)} aria-label="Next card" className="w-8 h-10 shrink-0 rounded-lg border border-gray-700 text-gray-400 hover:text-white">›</button>}
          </div>

          {edition && seasonId
            ? <PrintView card={card} edition={edition} seasonId={seasonId} ownerName={ownerName} canUpgrade={canUpgrade} tradeWith={tradeWith} pinnedUid={pinnedUid} favouriteUids={favouriteUids} onBack={dialog.only ? undefined : () => setPrintId(null)} />
            : <EditionsView card={card} dialog={dialog} seasonId={seasonId} onPick={setPrintId} showAll={() => setShowAll(true)} />}

          <CardInfo card={card} totalScore={totalScore} canUpgrade={canUpgrade} ownerName={ownerName} tradeWith={edition ? undefined : tradeWith} shown={edition?.variant ?? best} />
        </div>
      </div>
    </div>
  );
}

/** Step 1: one small tile per edition, grouped by version (or one tile per version with its count when editions are not tracked). */
function EditionsView({ card, dialog, seasonId, onPick, showAll }: { card: GridCard; dialog: ReturnType<typeof copiesForDialog<DialogCopy>>; seasonId?: string; onPick: (id: string) => void; showAll: () => void }) {
  const rarity = getRarity(card.stars);
  const tileStyle = (v: Variant) => ({ borderColor: rarity?.hex, ...holoVars(card.holo[v]) } as React.CSSProperties);
  const tileClass = (v: Variant) => `relative aspect-2/3 w-full rounded-lg overflow-hidden border-2 bg-gray-900 ${v !== 'regular' ? `vfx-${v} ` : ''}${holoClass(card.holo[v])}`;
  const art = (v: Variant) => <img src={stillFor(card, artFor(card, v))} alt="" loading="lazy" className="w-full h-full object-cover" />;
  return (
    <div className="space-y-4">
      {dialog.groups.map(g => (
        <section key={g.variant} aria-label={`${VARIANT_LABELS[g.variant]} editions`}>
          <h3 className="text-[11px] uppercase tracking-wider text-gray-400 font-bold mb-2">{VARIANT_LABELS[g.variant]} <span className="text-gray-600 normal-case tracking-normal">×{g.count}</span></h3>
          {dialog.tracked ? (
            <ul className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 gap-2">
              {g.copies.map(c => (
                <li key={c.id} className="min-w-0">
                  <button type="button" onClick={() => onPick(c.id)} aria-label={`${VARIANT_LABELS[g.variant]} edition #${c.n}${c.uid ? `, serial number ${c.uid}` : ''}${c.m ? ', edition bonus' : ''}`}
                    className="group block w-full text-left focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-yellow-400 rounded-lg">
                    <span className={`${tileClass(g.variant)} block transition-transform group-hover:-translate-y-0.5`} style={tileStyle(g.variant)}>{art(g.variant)}</span>
                    <span className="mt-1 flex items-center gap-1 min-w-0">
                      <SerialChip n={c.n} bonus={c.m} est={c.est} className="text-[10px]! px-1.5! py-0!" />
                    </span>
                    {c.uid ? <span className="block truncate text-[10px] text-gray-500 tabular-nums">Serial #{c.uid}</span> : null}
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
      {seasonId && dialog.tracked && <p className="text-[11px] text-gray-600">Choose an edition to see its edition number, serial number, points and history. The first editions ever made of a card are worth extra points.</p>}
      {!dialog.tracked && <p className="text-[11px] text-gray-600">This season does not number its editions, so each version shows as one tile.</p>}
    </div>
  );
}

const pill = 'inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 border text-gray-200 bg-white/6 border-white/10 hover:bg-white/10';

/** Step 2: one edition, turned over on the flip card, with what it is worth and where it has been. */
function PrintView({ card, edition, seasonId, ownerName, canUpgrade, tradeWith, pinnedUid, favouriteUids, onBack }: { card: GridCard; edition: DialogCopy; seasonId: string; ownerName?: string; canUpgrade: boolean; tradeWith?: string; pinnedUid?: number; favouriteUids?: number[]; onBack?: () => void }) {
  const rarity = getRarity(card.stars);
  const v = edition.variant;
  const href = printHref(seasonId, edition);
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}${href}`;
    try {
      if (navigator.share) { await navigator.share({ title: `${card.name}${edition.uid ? ` #${edition.uid}` : ''}`, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* cancelled or blocked */ }
  };
  const art = artFor(card, v);
  const face = (
    <div
      className={`relative w-full aspect-2/3 rounded-xl overflow-hidden border-2 bg-gray-900 ${v !== 'regular' ? `vfx-${v}` : ''} ${holoClass(card.holo[v], true)}`}
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
  const journey = [`${edition.origin ?? 'Made'}${edition.at ? `, ${engravedDate(edition.at)}` : ''}`, ...(edition.j ?? [])].slice(0, 3);
  const step = card.steps[v];
  const showUpgrade = canUpgrade && card.upgradable && step && card.counts[v] > 0;
  return (
    <div className="space-y-4">
      {onBack && <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-bold text-yellow-400 hover:text-yellow-300">‹ Back to all editions</button>}
      <div className="grid sm:grid-cols-[220px_1fr] gap-5">
        <div className="mx-auto w-full max-w-[220px]">
          {edition.at
            ? <FlipCard compact back={flipBackFor({ n: edition.n, uid: edition.uid, total: edition.made, variant: v, name: card.name, at: edition.at, est: edition.est, bonus: edition.m, hex: rarity?.hex, holder: ownerName ? `@${ownerName}` : 'you', href }, card.back)}>{face}</FlipCard>
            : face}
        </div>
        <div className="space-y-3 min-w-0">
          <div>
            <p className="font-display text-xl font-bold text-white">{VARIANT_LABELS[v]} {card.name}</p>
            <p className="text-sm text-gray-300 mt-0.5">Edition<InfoTip term="edition" /> <strong className="text-white tabular-nums">#{edition.n}</strong>{edition.made && edition.made >= edition.n ? <> of {edition.made.toLocaleString()} made</> : null}{edition.est && <span className="ml-2 text-[10px] font-extrabold uppercase tracking-wider rounded-full px-2 py-0.5 border border-amber-400/40 text-amber-300 bg-amber-500/10">estimated number</span>}</p>
            {edition.uid ? <p className="text-sm text-gray-400 tabular-nums">Serial #{edition.uid}<InfoTip term="printNumber" /></p> : null}
          </div>
          <div className={`rounded-xl border p-3 flex flex-wrap items-center gap-x-3 gap-y-1 ${edition.m ? 'border-yellow-500/50 bg-yellow-500/[0.07]' : 'border-gray-800 bg-gray-950/60'}`}>
            <SerialChip n={edition.n} bonus={edition.m} est={edition.est} className="text-sm px-3! py-1!" />
            <span className="inline-flex items-center gap-1 text-sm text-gray-200">Worth <strong className="text-white tabular-nums">{(edition.p ?? card.values[v]).toLocaleString()} pts</strong></span>
            {/* the chip already shows the multiplier, so this only names it */}
            <span className="inline-flex items-center text-xs text-gray-500 sm:ml-auto">{edition.m ? 'Edition bonus' : 'No edition bonus'}<InfoTip term="editionBonus" /></span>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-bold mb-1">Journey</p>
            <ol className="space-y-0.5 text-sm text-gray-300">{journey.map((t, i) => <li key={i} className="flex gap-2"><span aria-hidden className="text-gray-600">•</span>{t}</li>)}</ol>
          </div>
          <div className="flex flex-wrap items-start gap-2 pt-1">
            <a href={href} className={pill}>Open edition page</a>
            <button type="button" onClick={share} className={pill}><Icon name="share" />{copied ? 'Link copied' : 'Share this edition'}</button>
            {canUpgrade && edition.uid ? <PinCopyButton uid={edition.uid} pinned={pinnedUid === edition.uid} /> : null}
            {canUpgrade && edition.uid ? <FavouriteCopyButton uid={edition.uid} favourite={!!favouriteUids?.includes(edition.uid)} /> : null}
            {tradeWith && <a href={`/trade/new?to=${encodeURIComponent(tradeWith)}&want=${card.number}.${v}`} className="inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 border border-purple-400/40 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20"><Icon name="trade" />Offer a trade</a>}
          </div>
          {canUpgrade && card.kind === 'trainer' && v === 'regular' && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 pt-1">
              <UseTrainerButton
                cardNumber={card.number}
                cardName={card.name}
                seasonId={seasonId}
                isFavourite={!!edition.uid && !!favouriteUids?.includes(edition.uid)}
                disabled={card.counts.regular < 1}
              />
              <span>Trainer cards activate their buff and consume 1 Regular edition.</span>
            </div>
          )}
          {showUpgrade && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <UpgradeButton cardNumber={card.number} from={v} to={step!.to} have={card.counts[v]} cost={step!.cost} holo={card.holo} card={{ name: card.name, imageUrl: card.imageUrl, fullArtImageUrl: card.fullArtImageUrl }} />
              <span>Upgrades spend your newest editions first.</span>
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
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">{ownerName ? `${ownerName}’s editions are worth` : 'Your editions are worth'}</p>
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
          {(!card.copies || card.copies.length === 0) && card.serial.mult <= 1 && 'Low edition numbers earn a bonus; none of these editions qualify. '}
          {outThere.toLocaleString()} pull{outThere === 1 ? '' : 's'} of {VARIANT_LABELS[shown]} out there
        </p>

        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="table table-sm w-full text-sm">
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
          {canUpgrade && card.upgradable ? 'Upgrades are permanent: the editions you spend are destroyed. The newest edition numbers go first, so an edition with a low edition number is safe. ' : ''}Card values change as the season goes on; edition bonuses never do.{' '}
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
