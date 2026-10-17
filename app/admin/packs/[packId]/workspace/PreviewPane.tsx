'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { CardTile } from '@/app/components/CardTile';
import { FlipCard } from '@/app/components/FlipCard';
import { sampleFlipBack } from '@/lib/flip-back';
import { cardThumbUrl, stillFor } from '@/lib/card-art';
import { resolveCardBack, type CardBackStyle } from '@/lib/card-back';
import { holoClass, holoVars, type HoloSpecs } from '@/lib/holo-core';
import type { PackInput } from '@/lib/pack-clean';
import type { WorkCard } from '@/lib/pack-editor-core';
import { getRarity } from '@/lib/rarity';
import { VARIANTS, VARIANT_LABELS, allowedVariants } from '@/lib/variants';
import type { Variant } from '@/lib/types';

type Tab = 'card' | 'back' | 'stream' | 'sizes';
const TABS: { id: Tab; label: string }[] = [{ id: 'card', label: 'Card' }, { id: 'back', label: 'Back' }, { id: 'stream', label: 'On stream' }, { id: 'sizes', label: 'Sizes' }];

export interface PreviewPaneProps {
  packId: string;
  pack: PackInput;
  /** The card being edited (null = the pack row: the first card stands in). */
  card: WorkCard | null;
  /** Several cards selected: shown as a contact sheet. */
  selection: WorkCard[];
  cards: WorkCard[];
  holoByStars: Record<number, HoloSpecs>;
  /** The saved card back design of this pack (the Card back editor's own unsaved state is not shown here). */
  cardBack: CardBackStyle | null;
  seasonName?: string;
  /** The overlay only knows packs of the active season. */
  onStream: boolean;
  compact?: boolean;
}

/** The centre of the workspace: what the selection looks like to players and on stream, built from the UNSAVED state. */
export function PreviewPane(p: PreviewPaneProps) {
  const [tab, setTab] = useState<Tab>('card');
  const shown = p.card ?? p.cards.find(c => c.imageUrl) ?? p.cards[0] ?? null;
  const multi = p.selection.length > 1;

  return (
    <div className={`w-full flex flex-col items-center gap-3 ${p.compact ? '' : 'h-full min-h-0'}`}>
      {!multi && (
        <div role="tablist" aria-label="Preview" className="flex gap-1 rounded-xl bg-gray-900 border border-gray-800 p-1">
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} type="button" onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg ${tab === t.id ? 'bg-yellow-500/15 text-yellow-300' : 'text-gray-400 hover:text-white'}`}>{t.label}</button>
          ))}
        </div>
      )}
      <div className="w-full flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center">
        {multi ? <ContactSheet cards={p.selection} />
          : !shown ? <p className="text-sm text-gray-500">Add a card to preview it.</p>
          : tab === 'card' ? <FrontTab {...p} card={p.card} shown={shown} />
          : tab === 'back' ? <BackTab {...p} shown={shown} />
          : tab === 'stream' ? <StreamTab {...p} shown={shown} />
          : <SizesTab {...p} shown={shown} />}
      </div>
    </div>
  );
}

const hexOf = (c: WorkCard) => getRarity(c.stars)?.hex;

function variantsFor(pack: PackInput, c: WorkCard): Variant[] {
  return pack.upgradesEnabled && c.upgradesEnabled ? allowedVariants({ disabledVariants: pack.disabledVariants }, { disabledVariants: c.disabledVariants }) : ['regular'];
}

function artOf(c: WorkCard, v: Variant) {
  return (v === 'full' || v === 'shiny') && c.fullArtImageUrl ? c.fullArtImageUrl : c.imageUrl;
}

/** The front exactly as the site draws it: rarity border and glow, the version's look and its holo. */
function Front({ c, v, holo, animated, className = '' }: { c: WorkCard; v: Variant; holo: HoloSpecs | undefined; animated: boolean; className?: string }) {
  const art = artOf(c, v);
  const spec = holo?.[v];
  const style = { borderColor: hexOf(c), boxShadow: `0 0 28px -6px ${hexOf(c)}`, ...holoVars(spec) };
  const cls = `relative aspect-[2/3] rounded-xl overflow-hidden border-2 bg-gray-900 ${v !== 'regular' ? `vfx-${v}` : ''} ${holoClass(spec, true)} ${className}`;
  if (!art) return <div className={`${cls} flex items-center justify-center`} style={style}><Icon name="image" className="w-10 h-10 text-gray-600" /></div>;
  if (animated) return <div className={cls} style={style}><img src={art} alt={c.name} className="w-full h-full object-cover" /></div>;
  return <CardTile imageUrl={art} still={stillFor(c, art)} alt={c.name} className={cls} style={style} />;
}

function FrontTab({ pack, card, shown, holoByStars }: PreviewPaneProps & { shown: WorkCard }) {
  const [variant, setVariant] = useState<Variant>('regular');
  const [animated, setAnimated] = useState(true);
  const allowed = variantsFor(pack, shown);
  const v = allowed.includes(variant) ? variant : 'regular';
  const rarity = getRarity(shown.stars);
  const animates = cardThumbUrl(artOf(shown, v)) !== artOf(shown, v);
  return (
    <div className="text-center space-y-3">
      {!card && <p className="text-xs text-gray-500">The pack row is selected, so the first card stands in.</p>}
      <div className="w-60 mx-auto"><Front c={shown} v={v} holo={holoByStars[shown.stars]} animated={animated} /></div>
      <div>
        <p className="font-display text-xl font-bold text-white truncate max-w-[16rem] mx-auto">{shown.name || 'Untitled card'}</p>
        <p className="text-sm font-semibold" style={{ color: rarity?.hex }}>{'★'.repeat(shown.stars)} {rarity?.label}</p>
      </div>
      <div role="group" aria-label="Version" className="flex flex-wrap justify-center gap-1.5">
        {VARIANTS.filter(x => allowed.includes(x)).map(x => (
          <button key={x} type="button" aria-pressed={v === x} onClick={() => setVariant(x)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${v === x ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:text-white'}`}>{VARIANT_LABELS[x]}</button>
        ))}
      </div>
      {animates && (
        <div role="group" aria-label="Art" className="flex justify-center gap-1.5">
          {([true, false] as const).map(a => (
            <button key={String(a)} type="button" aria-pressed={animated === a} onClick={() => setAnimated(a)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${animated === a ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:text-white'}`}>{a ? 'Animated' : 'Still frame'}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function BackTab({ pack, shown, holoByStars, cardBack, seasonName }: PreviewPaneProps & { shown: WorkCard }) {
  const style = resolveCardBack(cardBack, { packName: pack.name, seasonName, cover: pack.coverImageUrl || undefined });
  return (
    <div className="text-center space-y-3">
      <div className="w-60 mx-auto">
        <FlipCard
          key={`${shown.id}-${cardBack ? 'styled' : 'classic'}`} defaultFlipped
          back={sampleFlipBack(shown.name || 'Untitled card', hexOf(shown), style)}
        >
          <Front c={shown} v="regular" holo={holoByStars[shown.stars]} animated={false} />
        </FlipCard>
      </div>
      <p className="text-xs text-gray-500">A sample print. {cardBack ? 'This is the saved card back; design it under Pack settings.' : 'No card back is designed, so this is the classic plate. Design one under Pack settings.'}</p>
    </div>
  );
}

const STAGE_W = 1280, STAGE_H = 720;

function StreamTab({ packId, pack, shown, onStream }: PreviewPaneProps & { shown: WorkCard }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [loads, setLoads] = useState(0);
  const [scale, setScale] = useState(0.4);
  const [variant, setVariant] = useState<Variant>('regular');
  const allowed = variantsFor(pack, shown);
  const v = allowed.includes(variant) ? variant : 'regular';

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.max(0.1, Math.min(1, el.clientWidth / STAGE_W))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The unsaved card and pack fields go to the overlay's preview, then the view is re-drawn from them.
  const draft = useMemo(() => ({
    type: 'draft', packId,
    pack: { name: pack.name, coverImageUrl: pack.coverImageUrl, accentColor: pack.accentColor, tearBorderColor: pack.tearBorderColor, holoMinStars: pack.holoMinStars, cardTime: pack.cardTime, cooldownTime: pack.cooldownTime, soundVolume: pack.soundVolume, upgradesEnabled: pack.upgradesEnabled, variantWeights: pack.variantWeights, disabledVariants: pack.disabledVariants ?? [] },
    card: shown.number ? {
      number: shown.number, name: shown.name, stars: shown.stars, probability: shown.probability, image: shown.imageUrl, thumb: stillFor(shown, shown.imageUrl), soundUrl: shown.soundUrl || null,
      fullArt: shown.fullArtImageUrl || null, fullArtThumb: shown.fullArtImageUrl ? stillFor(shown, shown.fullArtImageUrl) : null, upgradesEnabled: shown.upgradesEnabled, disabledVariants: shown.disabledVariants,
    } : null,
  }), [packId, pack, shown]);
  const post = (m: object) => frame.current?.contentWindow?.postMessage(m, window.location.origin);
  useEffect(() => {
    if (!ready) return;
    post(draft); post({ type: 'variant', variant: v === 'regular' ? '' : v }); post({ type: 'props', props: null, packId, cardNumber: shown.number });
  }, [ready, loads, draft, v, packId, shown.number]);

  return (
    <div className="w-full space-y-2">
      {!onStream && <p role="note" className="text-xs text-amber-300 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">This pack is not drawn in the active season, so the stream view cannot show it. It shows another pack.</p>}
      {!shown.number && <p role="note" className="text-xs text-amber-300">This card is new: save it to see it on stream.</p>}
      <div ref={box} className="w-full rounded-xl overflow-hidden border border-gray-800 bg-black" style={{ height: STAGE_H * scale }}>
        <iframe ref={frame} src="/overlay.html?preview" title="Overlay preview" onLoad={() => { setReady(true); setLoads(n => n + 1); }}
          style={{ width: STAGE_W, height: STAGE_H, border: 0, background: 'transparent', colorScheme: 'light', transform: `scale(${scale})`, transformOrigin: 'top left' }} />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div role="group" aria-label="Version" className="flex flex-wrap gap-1.5">
          {VARIANTS.filter(x => allowed.includes(x)).map(x => (
            <button key={x} type="button" aria-pressed={v === x} onClick={() => setVariant(x)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${v === x ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:text-white'}`}>{VARIANT_LABELS[x]}</button>
          ))}
        </div>
        <button type="button" onClick={() => post({ type: 'pack' })} disabled={!ready} className="px-3 py-1.5 text-xs font-bold tcg-btn rounded-lg disabled:opacity-50"><Icon name="play" className="mr-1" />Play the reveal</button>
        <button type="button" onClick={() => post({ type: 'static', mode: 'pack' })} disabled={!ready} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-700 text-gray-200 hover:border-gray-500">Reset</button>
      </div>
    </div>
  );
}

function SizesTab({ pack, shown, holoByStars }: PreviewPaneProps & { shown: WorkCard }) {
  const holo = holoByStars[shown.stars];
  const label = (t: string) => <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mt-1.5">{t}</p>;
  return (
    <div className="flex flex-wrap items-end justify-center gap-6">
      <div className="text-center w-36">
        <Front c={shown} v="regular" holo={holo} animated={false} />
        <p className="text-xs text-white font-semibold truncate mt-1.5">{shown.name || 'Untitled card'}</p>
        {label('Card dex tile')}
      </div>
      <div className="text-center">
        <div className="w-20 rounded-md bg-gray-800/80 border border-gray-700 p-1"><Front c={shown} v="regular" holo={holo} animated={false} className="!rounded-md !border" /></div>
        {label('Binder slot')}
      </div>
      <div className="text-center w-56">
        <div className="rind rounded-2xl p-3"><Front c={shown} v={variantsFor(pack, shown).includes('shiny') ? 'shiny' : 'regular'} holo={holo} animated={false} /></div>
        {label('Profile showcase')}
      </div>
    </div>
  );
}

function ContactSheet({ cards }: { cards: WorkCard[] }) {
  return (
    <div className="w-full">
      <p className="text-sm text-gray-400 text-center mb-3">{cards.length} cards selected</p>
      <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(5rem,1fr))]">
        {cards.map(c => (
          <li key={c.id} className="text-center">
            <div className="aspect-[2/3] rounded-md overflow-hidden bg-gray-800 border" style={{ borderColor: hexOf(c) }}>
              {c.imageUrl ? <img src={cardThumbUrl(c.imageUrl)} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Icon name="image" className="text-gray-600" /></div>}
            </div>
            <p className="text-[10px] text-gray-400 truncate mt-0.5">{c.name || 'Untitled'}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
