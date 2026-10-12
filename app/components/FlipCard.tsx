'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import { editionLine, madeLine, type FlipBack } from '@/lib/flip-back';

/** A QR code as one SVG path (dark modules only), so it can be styled like the rest of the engraving. */
function qrPath(text: string): { d: string; size: number } | null {
  try {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const size = q.getModuleCount();
    let d = '';
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { d, size };
  } catch { return null; }
}

const MAX_TILT = 12;

/**
 * A card you can turn over. The front is whatever you pass as children (the normal art tile, holo and all); the back is an engraved
 * metal plate with the copy's serial number, date and where it came from. Moving the pointer over it (or dragging a finger) tilts it in
 * 3D, a tap or the Flip button turns it over. Reduced motion (the device setting or the site's Settings → Motion) swaps the turn for a
 * fade and drops the tilt.
 */
export function FlipCard({ children, back, compact = false, className = '' }: { children: ReactNode; back: FlipBack; compact?: boolean; className?: string }) {
  const [flipped, setFlipped] = useState(false);
  const [tilting, setTilting] = useState(false);
  const inner = useRef<HTMLDivElement>(null);
  const busyUntil = useRef(0);
  const qr = useMemo(() => (!compact && back.qrUrl ? qrPath(back.qrUrl) : null), [compact, back.qrUrl]);

  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (Date.now() < busyUntil.current) return;
    const el = inner.current;
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${((0.5 - y) * 2 * MAX_TILT).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((x - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
    if (!tilting) setTilting(true);
  }
  function rest() {
    const el = inner.current;
    if (el) { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); }
    setTilting(false);
  }
  function flip() {
    busyUntil.current = Date.now() + 700; // let the turn finish before the tilt takes over again
    setTilting(false);
    setFlipped(f => !f);
  }

  const made = madeLine(back.n, back.total);
  const gold = !!back.bonus && back.bonus > 1;
  const hex = back.hex ?? '#9ca3af';

  return (
    <div className={`flip-wrap ${className}`}>
      <div className="flip-card" data-flipped={flipped} onPointerMove={move} onPointerLeave={rest} onClick={flip}>
        <div ref={inner} className={`flip-inner ${tilting ? 'flip-tilting' : ''}`} style={{ ['--flip' as string]: flipped ? '180deg' : '0deg' }}>
          <div className="flip-face flip-front" aria-hidden={flipped}>
            {children}
            <span className="flip-glare" aria-hidden />
          </div>
          <div className="flip-face flip-back" aria-hidden={!flipped} style={{ ['--edge' as string]: hex }}>
            <div className="flip-plate">
              <p className="flip-brand">The Cheesy TCG</p>
              <p className={`flip-serial ${gold ? 'gold' : ''} ${back.uid ? 'long' : ''}`}>#{back.uid ?? back.n}</p>
              {back.uid ? <p className="flip-line">{editionLine(back.n, back.total)}</p> : made && <p className="flip-line">{made}</p>}
              <p className="flip-line strong">{back.variantLabel} · {back.name}</p>
              {back.date && <p className="flip-date">{back.est ? 'NUMBERED' : 'PULLED'} {back.date}</p>}
              {!compact && (
                <>
                  {(back.origin || back.holder) && <p className="flip-line small">{[back.origin, back.holder ? `Held by ${back.holder}` : null].filter(Boolean).join(' · ')}</p>}
                  {back.history && back.history.length > 0 && (
                    <ul className="flip-hist">
                      {back.history.map((h, i) => <li key={i}><span>{h.text}</span><span>{h.date}</span></li>)}
                    </ul>
                  )}
                </>
              )}
              <div className="flip-foot">
                {qr && (
                  <svg className="flip-qr" viewBox={`-1 -1 ${qr.size + 2} ${qr.size + 2}`} role="img" aria-label="QR code for this copy's page" shapeRendering="crispEdges">
                    <rect x={-1} y={-1} width={qr.size + 2} height={qr.size + 2} fill="rgba(255,255,255,.88)" />
                    <path d={qr.d} fill="#1f1f24" />
                  </svg>
                )}
                {back.href && (
                  <a href={back.href} tabIndex={flipped ? 0 : -1} onClick={e => e.stopPropagation()} className="flip-link">Full history ›</a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <button type="button" className="flip-btn" aria-pressed={flipped} onClick={flip}>
        {flipped ? 'Show the front' : 'Flip to see the serial'}
      </button>
    </div>
  );
}
