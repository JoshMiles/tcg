'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatedArt } from '@/app/components/AnimatedArt';
import { cardThumbUrl } from '@/lib/card-art';
import { VARIANT_LABELS } from '@/lib/variants';
import { holoClass, holoVars } from '@/lib/holo-core';
import type { Variant } from '@/lib/types';
import type { Swap, SwapCard } from '@/lib/trade-notice-core';

const PILL: Record<Variant, string> = {
  regular: 'linear-gradient(90deg,#64748b,#475569)',
  reverse: 'linear-gradient(90deg,#8b5cf6,#ec4899)',
  full: 'linear-gradient(90deg,#0ea5e9,#6366f1)',
  shiny: 'linear-gradient(90deg,#f59e0b,#ef4444,#a855f7)',
};
const SHOWN = 3; // cards drawn per side; the rest collapse into "+N"

const artFor = (c: SwapCard) => ((c.variant === 'full' || c.variant === 'shiny') && c.fullArtImageUrl ? c.fullArtImageUrl : c.imageUrl);

function Side({ cards, caption, cls }: { cards: SwapCard[]; caption: string; cls: string }) {
  const shown = cards.slice(0, SHOWN);
  const more = cards.length - shown.length;
  return (
    <div className={`tr-group ${cls}`}>
      <p className="tr-cap">{caption}</p>
      <div className="tr-row">
        {shown.map((c, i) => {
          const url = artFor(c);
          const thumb = cardThumbUrl(url);
          const fx = `${c.variant === 'regular' ? '' : `vfx-${c.variant}`} ${holoClass(c.holo?.[c.variant], true)}`.trim();
          return (
            <div key={`${c.number}:${c.variant}:${i}`} className="tr-card">
              <div className={`tr-art ${fx}`} style={{ ['--art-mask' as string]: thumb !== url ? `url("${thumb}")` : 'none', ...holoVars(c.holo?.[c.variant]) }}>
                <AnimatedArt url={url} alt={c.name} />
              </div>
              {c.count > 1 && <span className="tr-count">×{c.count}</span>}
              {c.variant !== 'regular' && <span className="tr-var" style={{ background: PILL[c.variant] }}>{VARIANT_LABELS[c.variant]}</span>}
            </div>
          );
        })}
        {more > 0 && <span className="tr-more">+{more}</span>}
      </div>
    </div>
  );
}

/**
 * The trade moment: both sides show their cards, the two groups swap across the middle, a flash, and the cards you received
 * settle in the centre (with the same holo as everywhere else). Click, tap, Enter or Escape to continue; it also closes itself.
 */
export function TradeCeremony({ swap, onClose }: { swap: Swap; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [canClose, setCanClose] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const unlock = setTimeout(() => setCanClose(true), 1600);
    const auto = setTimeout(onClose, 10000);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(unlock); clearTimeout(auto); window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  if (!mounted) return null;

  return createPortal(
    <div className="tr-overlay" role="dialog" aria-label={`Trade with ${swap.with}`} onClick={() => { if (canClose) onClose(); }}>
      <div className="tr-stage">
        <Side cards={swap.gave} caption="You gave" cls="tr-gave" />
        <Side cards={swap.got} caption="You got" cls="tr-got" />
        <div className="tr-ring" aria-hidden />
        <div className="tr-flash" aria-hidden />
        <div className="tr-text">
          <p className="tr-title">Trade complete!</p>
          <p className="tr-sub">with @{swap.with}</p>
          <p className="ug-hint">{canClose ? 'Tap anywhere to continue' : ' '}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
