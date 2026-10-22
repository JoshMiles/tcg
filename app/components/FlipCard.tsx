'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { qrPath } from '@/lib/qr';
import type { FlipBack } from '@/lib/flip-back';
import { DEFAULT_CARD_BACK, plateVars } from '@/lib/card-back';
import { capRuns, fontsNeeded, layoutBack, lineCss, SMALLCAP_SCALE, type ArcGeo, type BackNode, type TextLine } from '@/lib/card-back-layout';
import { markPieces } from '@/lib/text-markup';
import { loadBackFont } from '@/lib/card-back-fonts';

const MAX_TILT = 12;

/**
 * A card you can turn over. The front is whatever you pass as children (the normal art tile, holo and all); the back is an engraved
 * metal plate with the copy's serial number, date and where it came from. Moving the pointer over it (or dragging a finger) tilts it in
 * 3D, a tap or the Flip button turns it over. Reduced motion (the device setting or the site's Settings → Motion) swaps the turn for a
 * fade and drops the tilt.
 */
export function FlipCard({ children, back, compact = false, className = '', defaultFlipped = false, bare = false }: { children: ReactNode; back: FlipBack; compact?: boolean; className?: string; defaultFlipped?: boolean; /** Just the back, flat: no turning, tilting or button (the card back editor draws on it). */ bare?: boolean }) {
  const [flipped, setFlipped] = useState(defaultFlipped);
  const [tilting, setTilting] = useState(false);
  const inner = useRef<HTMLDivElement>(null);
  const busyUntil = useRef(0);
  const st = back.style;
  const hex = back.hex ?? '#9ca3af';
  const plateStyle = st ? plateVars(st, hex) : { '--edge': hex };
  // The layout reads the card's size only for free-placed elements; the classic stack is laid out by the stylesheet.
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 220, h: 330 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setSize(s => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height })); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Auto-fit text is measured with the real font, so lay out again once the fonts a design needs have loaded.
  const [fontsReady, setFontsReady] = useState(0);
  const nodes = useMemo(() => layoutBack(st ?? DEFAULT_CARD_BACK, back, size, { compact }), [st, back, size, compact, fontsReady]); // eslint-disable-line react-hooks/exhaustive-deps
  const stackNodes = nodes.filter(n => n.mode === 'stack');
  const freeNodes = nodes.filter(n => n.mode === 'free');
  const fits = nodes.some(n => n.spec);
  const fontKey = JSON.stringify(fontsNeeded(nodes));
  useEffect(() => {
    const loads = fontsNeeded(nodes).map(f => loadBackFont(f.id, f.weight, f.italic));
    if (fits) void Promise.all(loads).then(() => setFontsReady(n => n + 1));
  }, [fontKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const qrs = useMemo(() => new Map(nodes.filter(n => n.qrUrl).map(n => [n.id, qrPath(n.qrUrl!)])), [nodes]);
  const qrOf = (n: BackNode) => qrs.get(n.id) ?? null;

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

  const plate = (
            <div className="flip-plate" style={plateStyle as React.CSSProperties}>
              {stackNodes.map((n, i) => {
                if (n.kind === 'qr' || n.kind === 'link') {
                  if (stackNodes.findIndex(x => x.kind === 'qr' || x.kind === 'link') !== i) return null;
                  return <div key="foot" className="flip-foot">{stackNodes.filter(x => x.kind === 'qr' || x.kind === 'link').map(x => <BackNodeView key={x.id} n={x} qr={qrOf(x)} flipped={flipped} />)}</div>;
                }
                return <BackNodeView key={n.id} n={n} qr={null} flipped={flipped} />;
              })}
              {freeNodes.map(n => <BackNodeView key={n.id} n={n} qr={qrOf(n)} flipped={flipped} />)}
            </div>
  );

  if (bare) {
    return (
      <div className={`flip-wrap ${className}`}>
        <div ref={box} className="flip-card" data-flipped="true" style={{ cursor: 'default' }}>
          <div className="flip-face flip-back" style={{ transform: 'none' }}>{plate}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flip-wrap ${className}`}>
      <div ref={box} className="flip-card" data-flipped={flipped} onPointerMove={move} onPointerLeave={rest} onClick={flip}>
        <div ref={inner} className={`flip-inner ${tilting ? 'flip-tilting' : ''}`} style={{ ['--flip' as string]: flipped ? '180deg' : '0deg' }}>
          <div className="flip-face flip-front" aria-hidden={flipped}>
            {children}
            <span className="flip-glare" aria-hidden />
          </div>
          <div className="flip-face flip-back" aria-hidden={!flipped}>
            {plate}
          </div>
        </div>
      </div>
      <button type="button" className="flip-btn" aria-pressed={flipped} onClick={flip}>
        {flipped ? 'Show the front' : 'Flip to see the serial number'}
      </button>
    </div>
  );
}

/** Text on a curve: an SVG the size of the node's box, the text riding the baseline path. public/widget.js's backArcSvg draws the same thing. */
function ArcText({ a, text }: { a: ArcGeo; text: string }) {
  const gid = `${a.key}g`, pid = `${a.key}p`;
  return (
    <svg width={a.w} height={a.h} viewBox={`0 0 ${a.w} ${a.h}`} style={{ display: 'block', overflow: 'visible', ...(a.filter ? { filter: a.filter } : {}) }} aria-hidden="true">
      <defs>
        <path id={pid} d={a.d} />
        {a.grad && <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={a.grad.x1} y1={a.grad.y1} x2={a.grad.x2} y2={a.grad.y2}>{a.grad.stops.map((s, i) => <stop key={i} offset={`${s.at}%`} stopColor={s.c} />)}</linearGradient>}
      </defs>
      <text fill={a.grad ? `url(#${gid})` : 'currentColor'} style={{ textShadow: 'none', ...(a.stroke ? { stroke: a.stroke.color, strokeWidth: a.stroke.width, strokeLinejoin: 'round' as const, paintOrder: a.stroke.outside ? 'stroke fill' : 'normal' } : {}) }} textAnchor={a.off === 0 ? 'start' : a.off === 1 ? 'end' : 'middle'}>
        <textPath href={`#${pid}`} startOffset={`${a.off * 100}%`}>{text}</textPath>
      </text>
    </svg>
  );
}

/** One line's text: plain, in small capitals, and/or in the pieces its markup styles (bold, italic, colour; a gradient fill wins over a colour). */
function LineBody({ l, spec, gradient }: { l: TextLine; spec: BackNode['spec']; gradient: boolean }) {
  if (!l.t) return <>{' '}</>;
  const caps = (t: string) => (spec?.smallCaps ? capRuns(t).map((r, k) => (r.s ? <span key={k} style={{ fontSize: `${SMALLCAP_SCALE}em` }}>{r.t}</span> : r.t)) : t);
  if (!spec?.marks) return <>{caps(l.t)}</>;
  return <>{markPieces(l.t, l.o ?? 0, spec.marks, l.e).map((p, k) => (p.bold || p.italic || p.color
    ? <span key={k} style={{ ...(p.bold ? { fontWeight: Math.max(spec.weight, 700) } : {}), ...(p.italic ? { fontStyle: 'italic' as const } : {}), ...(p.color && !gradient ? { color: p.color } : {}) }}>{caps(p.t)}</span>
    : <span key={k}>{caps(p.t)}</span>))}</>;
}

/** One node of the back: the same elements and classes the classic plate always used, so the stylesheet draws them as before. */
function BackNodeView({ n, qr, flipped }: { n: BackNode; qr: { d: string; size: number } | null; flipped: boolean }) {
  const style = { ...n.vars, ...n.css } as React.CSSProperties;
  const cls = n.cls;
  const id = { 'data-back-id': n.id };
  switch (n.tag) {
    case 'img': return <img {...id} src={n.src} alt="" className={cls} style={style} />;
    case 'p': if (n.arc) return <p {...id} className={cls} style={style}><ArcText a={n.arc} text={n.text ?? ''} /></p>;
      return <p {...id} className={cls} style={style}>{n.lines ? n.lines.map((l, i) => <span key={i} style={lineCss(l) as React.CSSProperties}><LineBody l={l} spec={n.spec} gradient={n.css.color === 'transparent'} /></span>) : n.text}</p>;
    case 'ul': return <ul {...id} className={cls} style={style}>{n.items?.map((h, i) => <li key={i}><span>{h.text}</span><span>{h.date}</span></li>)}</ul>;
    case 'a': return <a {...id} href={n.href} tabIndex={flipped ? 0 : -1} onClick={e => e.stopPropagation()} className={cls} style={style}>{n.text}</a>;
    case 'qr':
      return qr ? (
        <svg {...id} className={cls} style={style} viewBox={`-1 -1 ${qr.size + 2} ${qr.size + 2}`} role="img" aria-label="QR code for this edition's page" shapeRendering="crispEdges">
          <rect x={-1} y={-1} width={qr.size + 2} height={qr.size + 2} fill={n.light ?? 'rgba(255,255,255,.88)'} />
          <path d={qr.d} fill={n.dark ?? '#1f1f24'} />
        </svg>
      ) : null;
    default: return null;
  }
}
