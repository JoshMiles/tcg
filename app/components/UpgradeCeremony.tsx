'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatedArt } from '@/app/components/AnimatedArt';
import { cardThumbUrl } from '@/lib/card-art';
import { VARIANT_LABELS } from '@/lib/variants';
import type { Variant } from '@/lib/types';
import { holoClass, holoVars, type HoloSpecs } from '@/lib/holo-core';

/** How many of the spiralling ingredient cards play the card's animation (the rest stay still: ten animated copies is wasted work at that size). */
const ANIMATED_INGREDIENTS = 5;

export interface CeremonyCard {
  name: string;
  imageUrl: string;
  fullArtImageUrl?: string;
}

const PILL: Record<Variant, string> = {
  regular: 'linear-gradient(90deg,#f1bb06,#f1bb06)',
  reverse: 'linear-gradient(90deg,#8b5cf6,#ec4899)',
  full: 'linear-gradient(90deg,#0ea5e9,#6366f1)',
  shiny: 'linear-gradient(90deg,#f59e0b,#ef4444,#a855f7)',
};

/** The art a variant shows: Full Art and Shiny use the full-art image where the card has one. */
const artFor = (card: CeremonyCard, v: Variant) => ((v === 'full' || v === 'shiny') && card.fullArtImageUrl ? card.fullArtImageUrl : card.imageUrl);

/**
 * The upgrade moment: the spent copies spiral into the middle, a flash, and the new variant is revealed with its holo / glow.
 * Click, tap, Enter or Escape to continue (it also closes by itself). Reduced motion skips the movement and shows the result.
 */
export function UpgradeCeremony({
  card, from, to, cost, gain, holo, onClose,
}: {
  card: CeremonyCard; from: Variant; to: Variant; cost: number; gain?: number;
  /** The card's holographic shimmer per variant, from the Overlay Editor settings (see lib/holo.ts). */
  holo?: HoloSpecs;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);          // the animated art has loaded
  const [canClose, setCanClose] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const unlock = setTimeout(() => setCanClose(true), 1800);
    const auto = setTimeout(onClose, 9000);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(unlock); clearTimeout(auto); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  if (!mounted) return null;
  const newArt = artFor(card, to);
  const fromThumb = cardThumbUrl(artFor(card, from));
  const newThumb = cardThumbUrl(newArt);
  const n = Math.min(Math.max(cost, 2), 10);          // show up to ten ingredient cards, however many were spent
  const fx = `${to === 'regular' ? '' : `vfx-${to}`} ${holoClass(holo?.[to], true)}`.trim();
  // The spent copies keep the look of the variant they were (a Reverse Holo ingredient still shimmers).
  const fromArtUrl = artFor(card, from);
  const fromFx = `${from === 'regular' ? '' : `vfx-${from}`} ${holoClass(holo?.[from], true)}`.trim();
  const fromMask = fromThumb !== fromArtUrl ? `url("${fromThumb}")` : 'none';

  return createPortal(
    <div
      className="ug-overlay"
      role="dialog"
      aria-label={`Upgraded ${card.name} to ${VARIANT_LABELS[to]}`}
      onClick={() => { if (canClose) onClose(); }}
    >
      <div className="ug-stage">
        <div className="ug-ring" aria-hidden />
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className={`ug-ingredient ${fromFx}`} aria-hidden style={{ ['--a' as string]: `${(360 / n) * i}deg`, ['--d' as string]: `${i * 70}ms`, ['--art-mask' as string]: fromMask, ...holoVars(holo?.[from]) }}>
            {i < ANIMATED_INGREDIENTS ? <AnimatedArt url={fromArtUrl} alt="" /> : <img src={fromThumb} alt="" />}
          </div>
        ))}
        <div className="ug-flash" aria-hidden />

        <div className="ug-card">
          <div className={`ug-art ${fx}`} style={{ ['--art-mask' as string]: newThumb !== newArt ? `url("${newThumb}")` : 'none', ...holoVars(holo?.[to]) }}>
            <img src={newThumb} alt={card.name} />
            {newThumb !== newArt && (
              <img src={newArt} alt="" aria-hidden onLoad={() => setReady(true)} className={`ug-anim ${ready ? 'ug-anim-on' : ''}`} />
            )}
          </div>
        </div>

        {(to === 'full' || to === 'shiny') && (
          <div aria-hidden>
            {Array.from({ length: 16 }).map((_, i) => (
              <span
                key={i}
                className="ug-spark"
                style={{
                  ['--x' as string]: `${Math.round(Math.cos((i / 16) * Math.PI * 2) * (130 + (i % 3) * 40))}px`,
                  ['--y' as string]: `${Math.round(Math.sin((i / 16) * Math.PI * 2) * (150 + (i % 4) * 30))}px`,
                  color: to === 'shiny' ? '#ffd24d' : '#7cc7ff',
                }}
              >{i % 2 ? '✦' : '✧'}</span>
            ))}
          </div>
        )}

        <div className="ug-text">
          <p className="ug-title">Upgraded!</p>
          <p className="ug-card-name">{card.name}</p>
          <p className="ug-pill" style={{ background: PILL[to] }}>{VARIANT_LABELS[to]}</p>
          <p className="ug-sub">{cost}× {VARIANT_LABELS[from]} → 1 {VARIANT_LABELS[to]}{typeof gain === 'number' && <span className={gain >= 0 ? 'ug-gain' : 'ug-loss'}> · {gain >= 0 ? '+' : '−'}{Math.abs(gain).toLocaleString()} pts</span>}</p>
          <p className="ug-hint">{canClose ? 'Tap anywhere to continue' : ' '}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
