// The back's layout engine (ROADMAP 20.3a): a design and a print in, positioned nodes with their final styles out. Pure and client-safe.
// The DOM renderer (FlipCard) draws these nodes; the canvas and overlay renderers of 20.3c draw the same list, so every place shows the
// same design. STACK nodes are laid out by the plate's own CSS (today's centred column), FREE nodes carry final pixel positions.
import { BACK_FONTS, nearestWeight, type BackEl, type CardBackStyle, type Effects } from './card-back';
import { markPieces, markedText, stripMarkup, type TextMark } from './text-markup';
import { DEFAULT_MIN_SIZE, SCRIPT_SCALE, SCRIPT_SHIFT, SMALLCAP_SCALE, capRuns, caseOf, leadingOf, spacingEm, titleCase, wordEm } from './text-style';
export { capRuns, SMALLCAP_SCALE };
import { editionLine, madeLine, type FlipBack } from './flip-back';

export interface BackNode {
  id: string;
  kind: BackEl['kind'];
  mode: 'stack' | 'free';
  /** `foot` = a stack QR code or link that shows nothing for this print (the footer row is still kept, as it always was). */
  tag: 'p' | 'ul' | 'img' | 'qr' | 'a' | 'empty';
  /** The stylesheet classes of a stack node (`flip-serial gold` ...). Free nodes have none. */
  cls: string;
  text?: string;
  items?: { text: string; date: string }[];
  src?: string;
  qrUrl?: string;
  href?: string;
  /** CSS custom properties (stack nodes read them from the stylesheet). */
  vars: Record<string, string>;
  /** Final CSS declarations (free nodes: position, type and effects; stack nodes: extra effects only). */
  css: Record<string, string | number>;
  /** QR code colours, when set. */
  dark?: string;
  light?: string;
  /** Free text whose lines are broken here (wrapping, max lines, a box height, paragraphs, justify or auto-fit): the lines to draw and what made them. Every renderer draws these lines as they are. */
  lines?: TextLine[];
  spec?: TextSpec;
  /** Fonts this node needs loaded (curated ids with files). */
  font?: { id: string; weight: number; italic?: boolean };
  /** The bold / italic faces the text's markup needs, besides `font`. */
  moreFonts?: { id: string; weight: number; italic?: boolean }[];
  /** The effects the canvas draws itself (px at this layout's card width). With an inner shadow the DOM draws every shadow in one SVG filter, so `shadow` keeps the plain text-shadow list for the canvas. */
  inner?: Shade;
  shadow?: string;
  plate?: { color: string; radius: number; outline?: { color: string; width: number } };
  /** Text on a curve (free text with `arc`): the SVG the DOM and overlay draw, and the circle the canvas walks. Replaces `lines` / `spec`. */
  arc?: ArcGeo;
}

/**
 * The geometry of text on an arc, in px, in the node's own box (`w` wide, `h` tall, drawn by an SVG of that size). `d` is the baseline path;
 * the circle has radius `r` and `sweep` radians (signed: positive arches up). `ym` is the baseline's y in the middle. `off` is where the text sits
 * along the path (0 start, 0.5 middle, 1 end). Drawn with stroke / gradient / filter as given; `key` makes the SVG ids unique.
 */
export interface ArcGeo {
  d: string; w: number; h: number; r: number; sweep: number; ym: number; off: number; key: string;
  stroke?: { color: string; width: number; outside: boolean };
  grad?: { x1: number; y1: number; x2: number; y2: number; stops: { c: string; at: number }[] };
  filter?: string;
}

/** The arc for a box width, font size and bend (-100..100, 100 = half circle), the text sitting on a baseline that is level with straight text in the middle. */
export function arcGeometry(w: number, px: number, arc: number, align: string): Pick<ArcGeo, 'd' | 'w' | 'h' | 'r' | 'sweep' | 'ym' | 'off'> {
  const theta = (Math.abs(arc) / 100) * Math.PI, r = w / (2 * Math.sin(theta / 2)), s = r * (1 - Math.cos(theta / 2));
  const up = arc > 0, above = up ? px : px + s, below = up ? s + 0.4 * px : 0.4 * px;
  const h = 2 * Math.max(above - 0.3 * px, below + 0.3 * px), ym = h / 2 + 0.3 * px, ye = up ? ym + s : ym - s;
  const n = (v: number) => Math.round(v * 100) / 100;
  return { d: `M 0 ${n(ye)} A ${n(r)} ${n(r)} 0 0 ${up ? 1 : 0} ${n(w)} ${n(ye)}`, w: n(w), h: n(h), r: n(r), sweep: up ? theta : -theta, ym: n(ym), off: align === 'left' ? 0 : align === 'right' ? 1 : 0.5 };
}

/** A shadow in px: offset, blur radius, colour. */
export interface Shade { x: number; y: number; blur: number; color: string }

/** Text width at a 100 px font size with no letter spacing; auto-fit scales it to the box. */
export type Measure = (text: string, face: { family: string; weight: number; italic: boolean; kerning?: boolean }) => number;
export interface LayoutOptions { compact?: boolean; /** Measures text for auto-fit; defaults to the browser canvas, or a rough estimate without a DOM (the overlay's server side). */ measure?: Measure }

/** A rough width (0.55 em a character) for places with no canvas; fitted text there is approximate. */
const estimateMeasure: Measure = text => text.length * 55;

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** Measures with a canvas 2D context; undefined where there is no DOM. Fonts must be loaded first for exact widths. */
export function canvasMeasure(): Measure | undefined {
  if (typeof document === 'undefined') return undefined;
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  const ctx = measureCtx;
  if (!ctx) return undefined;
  return (text, face) => {
    let family = face.family;
    if (/^var\(|^inherit$/.test(face.family)) {
      const cs = getComputedStyle(document.body);
      const name = /^var\(([^,)]+)/.exec(face.family)?.[1];
      family = (name && cs.getPropertyValue(name).trim()) || cs.fontFamily;
    }
    ctx.font = `${face.italic ? 'italic ' : ''}${face.weight} 100px ${family}`;
    ctx.fontKerning = face.kerning === false ? 'none' : 'auto';
    return ctx.measureText(text).width;
  };
}

/** One drawn line of a text: its words, the first-line indent and the space above it (px), and whether it is stretched to the box width (justify). */
export interface TextLine {
  t: string; i: number; g: number; j: boolean;
  /** With markup (`TextSpec.marks`): where `t` starts in the plain text, and whether it ends in the ellipsis the breaker added. */
  o?: number; e?: true;
}

/** Everything line breaking and auto-fit need, in px. Sent with the node so the overlay can run `layoutText` again with a real measurer. */
export interface TextSpec {
  text: string; size: number; minPx: number; maxPx: number; fit: 'shrink' | 'width' | null;
  /** The text's width, and its height (0 = as tall as the text): inside the padding. */
  boxW: number; boxH: number;
  wrap: boolean; maxLines: number; indent: number; paraGap: number; lineHeight: number; spacingEm: number; upper: boolean; justify: boolean;
  family: string; weight: number; italic: boolean;
  /** Small capitals, extra word gap (em) and kerning: they change a line's width, so the fit counts them. */
  smallCaps?: boolean; wordEm?: number; kerning?: boolean;
  valign: 'top' | 'middle' | 'bottom'; pad: number;
  /** Bold, italic and colour stretches of `text` (offsets); absent = plain text, laid out exactly as before. Bold and italic change widths, colour does not. */
  marks?: TextMark[];
}

/**
 * Line breaking and auto-fit, once, for every renderer: the DOM back, the share canvas and the overlay all draw the lines this returns.
 * Greedy word wrap into `boxW` (a paragraph is the text between line breaks; its first line is indented), cut to `maxLines` and to what
 * fits `boxH`, the last line then ending with an ellipsis. `shrink` = the largest size up to `size` (down to `minPx`) where nothing is cut
 * and no line is wider than the box; `width` = one line exactly as wide as the box (between `minPx` and `maxPx`).
 * Keep public/widget.js (TEXT-FIT markers) in step; scripts/check-card-back.mts runs both on the same cases.
 */
export function layoutText(s: TextSpec, measure: Measure): { size: number; lines: TextLine[] } {
  const face = { family: s.family, weight: s.weight, italic: s.italic, ...(s.kerning === false ? { kerning: false } : {}) };
  const glyphs1 = (t: string, fc: typeof face) => (s.smallCaps ? capRuns(t).reduce((a, r) => a + (measure(r.t, fc) / 100) * (r.s ? SMALLCAP_SCALE : 1), 0) : measure(s.upper ? t.toUpperCase() : t, fc) / 100);
  // With marks each piece is measured in its own face; `o` is where `t` starts in the plain text, `ell` that its last character is the added ellipsis.
  const glyphs = (t: string, o?: number, ell?: boolean) => (s.marks
    ? markPieces(t, o ?? 0, s.marks, ell).reduce((a, p) => a + glyphs1(p.t, p.bold || p.italic ? { ...face, ...(p.bold ? { weight: Math.max(s.weight, 700) } : {}), italic: s.italic || !!p.italic } : face), 0)
    : glyphs1(t, face));
  const wid = (t: string, size: number, o?: number, ell?: boolean) => (glyphs(t, o, ell) + t.length * s.spacingEm + (t.split(' ').length - 1) * (s.wordEm ?? 0)) * size;
  const at = (o: number) => (s.marks ? { o } : {});
  const flow = (size: number) => {
    const lines: TextLine[] = [];
    let po = 0;
    s.text.split('\n').forEach((para, pi) => {
      const ws: { w: string; o: number }[] = [];
      let p = 0;
      for (const w of para.split(' ')) { if (w) ws.push({ w, o: po + p }); p += w.length + 1; }
      const p0 = po;
      po += para.length + 1;
      const words = ws.map(x => x.w);
      const ind = s.indent * size, gap = pi ? s.paraGap * size : 0;
      const start = lines.length;
      const meta = (j: boolean) => (lines.length === start ? { i: ind, g: gap, j } : { i: 0, g: 0, j });
      if (!s.wrap || words.length <= 1) { lines.push({ t: words.join(' '), ...meta(false), ...at(ws.length ? ws[0].o : p0) }); return; }
      let line = '', lo = 0;
      for (const x of ws) {
        const w = x.w, next = line ? line + ' ' + w : w;
        if (line && wid(next, size, lo) > s.boxW - (lines.length === start ? ind : 0)) { lines.push({ t: line, ...meta(s.justify), ...at(lo) }); line = w; lo = x.o; } else { if (!line) lo = x.o; line = next; }
      }
      lines.push({ t: line, ...meta(false), ...at(lo) });
    });
    let cap = s.maxLines > 0 ? s.maxLines : Infinity;
    if (s.boxH > 0) {
      let h = 0, n = 0;
      for (const l of lines) { h += size * s.lineHeight + l.g; if (h > s.boxH + 0.01) break; n++; }
      cap = Math.min(cap, Math.max(1, n));
    }
    const cut = lines.length > cap;
    if (cut) {
      lines.length = cap;
      const last = lines[cap - 1];
      let t = last.t;
      while (t && wid(t + '…', size, last.o, true) > s.boxW - last.i) t = t.slice(0, -1).trimEnd();
      last.t = t + '…'; last.j = false;
      if (s.marks) last.e = true;
    }
    let widest = 0;
    for (const l of lines) widest = Math.max(widest, wid(l.t, size, l.o, l.e) + l.i);
    return { lines, cut, widest };
  };
  const round = (n: number) => Math.round(n * 100) / 100;
  if (s.fit === 'width') {
    // With marks the text is not re-collapsed (that would shift the offsets); a leading gap just moves `o`.
    const flat = s.marks ? s.text.replace(/\n/g, ' ') : s.text.replace(/\n/g, ' ').replace(/ +/g, ' ');
    const t = flat.trim(), o = flat.length - flat.trimStart().length;
    const one = [{ t, i: 0, g: 0, j: false, ...at(o) }];
    const unit = wid(t, 1, o);
    if (!(unit > 0) || !(s.boxW > 0)) return { size: s.size, lines: one };
    return { size: round(Math.max(Math.min(s.minPx, s.maxPx), Math.min(s.maxPx, (s.boxW * 0.99) / unit))), lines: one };
  }
  let size = s.size;
  if (s.fit === 'shrink') {
    const ok = (z: number) => { const f = flow(z); return !f.cut && f.widest <= s.boxW + 0.01; };
    const lo0 = Math.min(s.minPx, s.size);
    if (!ok(s.size)) {
      if (!ok(lo0)) size = lo0;
      else { let lo = lo0, hi = s.size; for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; } size = lo; }
    }
    size = Math.max(lo0, Math.floor(size * 100 + 1e-6) / 100);
  }
  return { size, lines: flow(size).lines };
}

const hexOr = (c: string, rarity: string, auto: string) => (c === 'rarity' ? rarity : c === 'auto' ? auto : c);
const AUTO_INK = '#1c1c24';

/** Template placeholders; unknown ones are dropped. */
export function resolveTemplate(t: string, back: FlipBack, style: CardBackStyle): string {
  const vars: Record<string, string> = {
    pack: style.packName ?? '', season: style.seasonName ?? '', card: back.name, version: back.variantLabel, edition: String(back.n),
    printNumber: String(back.uid ?? back.n), holder: back.holder ?? '', date: back.date ?? '',
  };
  return t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
}

const f2 = (n: number) => Math.round(n * 100) / 100;
const withOpacity = (c: string, o?: number) => {
  if (o === undefined || o >= 1 || !/^#[0-9a-f]{6}$/i.test(c)) return c;
  const n = parseInt(c.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${o})`;
};

/**
 * An inner shadow and the drop shadows as a CSS `filter: url(...)` value. The drop shadows come along because a text-shadow would be
 * seen by the inner shadow (it reads the element's alpha), and because a text-shadow is painted over a gradient fill (background-clip: text).
 */
function shadeFilter(inner: Shade | undefined, outer: Shade[]): string {
  const sd = (b: number) => f2(b / 2);
  let x = inner
    ? '<feComponentTransfer in="SourceAlpha" result="inv"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>'
    + `<feOffset in="inv" dx="${inner.x}" dy="${inner.y}" result="o"/><feGaussianBlur in="o" stdDeviation="${sd(inner.blur)}" result="b"/>`
    + `<feFlood flood-color="${inner.color}"/><feComposite in2="b" operator="in" result="s"/><feComposite in="s" in2="SourceAlpha" operator="in" result="ins"/>`
    + '<feMerge result="body"><feMergeNode in="SourceGraphic"/><feMergeNode in="ins"/></feMerge>'
    : '<feMerge result="body"><feMergeNode in="SourceGraphic"/></feMerge>';
  outer.forEach((o, i) => { x += `<feGaussianBlur in="SourceAlpha" stdDeviation="${sd(o.blur)}"/><feOffset dx="${o.x}" dy="${o.y}" result="d${i}"/><feFlood flood-color="${o.color}"/><feComposite in2="d${i}" operator="in" result="g${i}"/>`; });
  x += `<feMerge>${outer.map((_, i) => `<feMergeNode in="g${outer.length - 1 - i}"/>`).join('')}<feMergeNode in="body"/></feMerge>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><filter id="f" x="-10%" y="-60%" width="120%" height="220%" color-interpolation-filters="sRGB">${x}</filter></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}#f")`;
}

/** What an element's effects (stroke, glow, shadows, inner shadow, bevel, plate, gradient text) become at a card width in px: the CSS, plus what the canvas draws itself. */
export function effectParts(fx: Effects, cardW: number): { css: Record<string, string | number>; inner?: Shade; shadow?: string; plate?: BackNode['plate'] } {
  const css: Record<string, string | number> = {};
  const outer: (Shade & { css: string })[] = [];
  const unit = cardW / 100, k = unit * 0.25;
  const on = (e?: { on?: false }) => !!e && e.on !== false;
  const st = fx.stroke;
  if (st && on(st) && st.width > 0) { css.WebkitTextStroke = `${f2(st.width * unit * 0.1)}px ${st.color}`; css.paintOrder = st.pos === 'center' ? 'normal' : 'stroke fill'; }
  const gl = fx.glow;
  if (gl && on(gl)) for (let i = 0; i < Math.ceil(gl.strength); i++) { const b = f2(gl.blur * k); outer.push({ x: 0, y: 0, blur: b, color: gl.color, css: `0 0 ${b}px ${gl.color}` }); }
  for (const sh of fx.shadows ?? []) if (on(sh)) { const x = f2(sh.x * k), y = f2(sh.y * k), b = f2(sh.blur * k), c = withOpacity(sh.color, sh.opacity); outer.push({ x, y, blur: b, color: c, css: `${x}px ${y}px ${b}px ${c}` }); }
  const bv = fx.bevel;
  if (bv && on(bv)) {
    const d = bv.depth, sg = bv.style === 'raised' ? -1 : 1, L = 'rgba(255,255,255,.55)', D = 'rgba(0,0,0,.4)';
    outer.push({ x: 0, y: sg * d, blur: 0, color: L, css: `0 ${sg * d}px 0 ${L}` }, { x: 0, y: -sg * d, blur: d, color: D, css: `0 ${-sg * d}px ${d}px ${D}` });
  }
  const out: ReturnType<typeof effectParts> = { css };
  const inn = fx.inner;
  const grad = !!fx.gradientText && on(fx.gradientText);
  if (inn && on(inn)) out.inner = { x: f2(inn.x * k), y: f2(inn.y * k), blur: f2(inn.blur * k), color: withOpacity(inn.color, inn.opacity) };
  if (out.inner || (grad && outer.length)) {
    if (outer.length) out.shadow = outer.map(o => o.css).join(', ');
    css.filter = shadeFilter(out.inner, outer);
  } else if (outer.length) css.textShadow = outer.map(o => o.css).join(', ');
  const pl = fx.plate, plateOn = !!pl && on(pl);
  if (pl && plateOn) {
    out.plate = { color: pl.color, radius: f2(pl.radius * unit), ...(pl.outline && pl.outline.width > 0 ? { outline: { color: pl.outline.color, width: f2(pl.outline.width * unit * 0.1) } } : {}) };
    css.borderRadius = out.plate.radius;
    if (out.plate.outline) css.boxShadow = `0 0 0 ${out.plate.outline.width}px ${out.plate.outline.color}`;
  }
  const g = fx.gradientText;
  if (g && on(g)) {
    const grad = `linear-gradient(${g.angle}deg, ${g.stops ? g.stops.map(x => `${x.color} ${x.at}%`).join(', ') : `${g.from}, ${g.to}`})`;
    // The plate is its own background layer: background-clip: text would otherwise clip its colour to the letters too.
    css.backgroundImage = plateOn ? `${grad}, linear-gradient(${pl!.color}, ${pl!.color})` : grad;
    css.textShadow = 'none'; // the stylesheet's engraved highlight would be painted over the gradient and wash it out
    css.WebkitBackgroundClip = plateOn ? 'text, border-box' : 'text'; css.backgroundClip = plateOn ? 'text, border-box' : 'text'; css.color = 'transparent'; css.WebkitTextFillColor = 'transparent';
  } else if (plateOn) css.backgroundColor = pl!.color;
  return out;
}

/** The CSS of an element's effects at a card width in px. */
export function effectsCss(fx: Effects, hex: string, cardW: number): Record<string, string | number> {
  void hex;
  return effectParts(fx, cardW).css;
}

/** The face a stacked line already has from the stylesheet. Anything else is written onto the node. */
const STACK_CLASSIC_FONT: Partial<Record<BackEl['kind'], string>> = { number: 'display' };
const STACK_PAINT_800 = new Set<BackEl['kind']>(['number', 'name', 'date', 'brand', 'link']);

/**
 * A stacked text element keeps today's face until its font is not that face (site display for the edition number, site body for
 * every other line). The number's face goes through `--num-font`, which the stylesheet already reads; the other lines get
 * `font-family`. A curated file is named so the page loads it, at the weight the line is painted (or the nearest file).
 */
function stackFace(e: BackEl, vars: Record<string, string>, css: Record<string, string | number>): BackNode['font'] {
  if (e.kind === 'qr' || e.kind === 'logo') return undefined;
  const classic = STACK_CLASSIC_FONT[e.kind] ?? 'body';
  if (e.font === classic) return undefined;
  const f = BACK_FONTS.find(x => x.id === e.font) ?? BACK_FONTS[0];
  if (e.kind === 'number') vars['--num-font'] = f.css;
  else css.fontFamily = f.css;
  if (!f.files) return undefined;
  const want = STACK_PAINT_800.has(e.kind) ? 800 : 400;
  const weight = nearestWeight(f, want);
  if (weight !== want) css.fontWeight = weight;
  return { id: f.id, weight };
}

/** What a stack or free element prints for this print; null = nothing to draw (the element is skipped). */
function content(e: BackEl, back: FlipBack, style: CardBackStyle, compact: boolean): Partial<BackNode> | null {
  switch (e.kind) {
    case 'logo': { const src = e.src === 'cover' ? style.cover : e.url; return src ? { tag: 'img', cls: 'flip-logo', src } : null; }
    case 'brand': return { tag: 'p', cls: 'flip-brand', text: 'The Cheesy TCG' };
    case 'number': return { tag: 'p', cls: `flip-serial ${!!back.bonus && back.bonus > 1 ? 'gold' : ''} ${back.uid ? 'long' : ''}`, text: `#${back.uid ?? back.n}` };
    case 'edition': { const t = back.uid ? editionLine(back.n, back.total) : madeLine(back.n, back.total); return t ? { tag: 'p', cls: 'flip-line', text: t } : null; }
    case 'name': return { tag: 'p', cls: 'flip-line strong', text: `${back.variantLabel} · ${back.name}` };
    case 'text': { const t = resolveTemplate(e.text, back, style); return t ? { tag: 'p', cls: 'flip-custom', text: t } : null; }
    case 'date': return back.date ? { tag: 'p', cls: 'flip-date', text: `${back.est ? 'NUMBERED' : 'PULLED'} ${back.date}` } : null;
    case 'origin': { const t = [back.origin, back.holder ? `Held by ${back.holder}` : null].filter(Boolean).join(' · '); return !compact && t ? { tag: 'p', cls: 'flip-line small', text: t } : null; }
    case 'history': return !compact && back.history && back.history.length > 0 ? { tag: 'ul', cls: 'flip-hist', items: back.history } : null;
    case 'qr': return !compact && back.qrUrl ? { tag: 'qr', cls: 'flip-qr', qrUrl: back.qrUrl } : null;
    case 'link': return back.href ? { tag: 'a', cls: 'flip-link', text: 'Full history ›', href: back.href } : null;
  }
}

/** The back's nodes for one print at one card size (`size` is the card's width and height in px; stack nodes ignore it). */
export function layoutBack(style: CardBackStyle, back: FlipBack, size: { w: number; h: number }, opts: LayoutOptions = {}): BackNode[] {
  const compact = !!opts.compact;
  const rarity = back.hex ?? '#9ca3af';
  const stack: BackNode[] = [];
  const free: (BackNode & { z: number; order: number })[] = [];
  style.elements.forEach((e, order) => {
    const isFoot = e.kind === 'qr' || e.kind === 'link';
    if (e.place === 'stack') {
      const c = e.show ? content(e, back, style, compact) : null;
      if (c && e.kind === 'text' && c.text) c.text = stripMarkup(c.text); // markup only styles free text boxes
      if (!c && !isFoot) return;
      const vars: Record<string, string> = {};
      let css: Record<string, string | number> = {};
      let inner: Shade | undefined, shadow: string | undefined;
      if (c) {
        const textual = e.kind !== 'qr' && e.kind !== 'logo';
        const ink = e.color === 'auto' ? null : hexOr(e.color, rarity, AUTO_INK);
        if (textual && ink && !(e.kind === 'number' && c.cls?.includes('gold'))) vars[e.kind === 'brand' || e.kind === 'link' ? '--accent-ink' : '--ink'] = ink;
        // A pressed bevel at depth 1 is the plate's own ink shadow (the stylesheet draws it); any other bevel, or an inner shadow, is written out.
        const bv = e.fx.bevel, std = !!bv && bv.on !== false && bv.style === 'pressed' && bv.depth === 1 && !e.fx.inner;
        if (textual && !std) vars['--ink-shadow'] = 'none';
        const { plate: _p, ...rest } = e.fx; void _p;
        const { bevel: _b, ...extra } = rest; void _b;
        const parts = effectParts(std ? extra : rest, size.w);
        css = parts.css; inner = parts.inner; shadow = parts.shadow;
        if (e.scale !== 1 && ['number', 'edition', 'name', 'date', 'origin', 'history', 'qr', 'brand'].includes(e.kind)) vars[`--k-${e.kind}`] = String(e.scale);
        if (e.kind === 'logo') vars['--logo-px'] = `${e.px}px`;
      }
      const font = c ? stackFace(e, vars, css) : undefined;
      stack.push({ id: e.id, kind: e.kind, mode: 'stack', tag: c?.tag ?? 'empty', cls: c?.cls ?? '', ...c, vars, css, ...(inner ? { inner } : {}), ...(shadow ? { shadow } : {}), ...(font ? { font } : {}), ...(e.kind === 'qr' && e.dark !== 'auto' ? { dark: e.dark } : {}), ...(e.kind === 'qr' && e.light !== 'auto' ? { light: e.light } : {}) });
      return;
    }
    // Free: a box placed in percent of the card.
    const c = e.show ? content(e, back, style, compact) : null;
    if (!c) return;
    const w = (e.w / 100) * size.w;
    const css: Record<string, string | number> = {
      position: 'absolute', left: Math.round(((e.x / 100) * size.w - w / 2) * 100) / 100, top: Math.round((e.y / 100) * size.h * 100) / 100, width: Math.round(w * 100) / 100,
      transform: `translateY(-50%)${e.rotate ? ` rotate(${e.rotate}deg)` : ''}`, zIndex: 10 + e.z, opacity: e.opacity, margin: 0,
    };
    let font: BackNode['font'];
    let moreFonts: BackNode['moreFonts'];
    let marks: TextMark[] | undefined;
    let spec: TextSpec | undefined;
    let lines: TextLine[] | undefined;
    let arcMode = false;
    if (e.kind !== 'qr' && e.kind !== 'logo') {
      const f = BACK_FONTS.find(x => x.id === e.font) ?? BACK_FONTS[0];
      const kase = caseOf(e), em = spacingEm(e), word = wordEm(e), lead = leadingOf(e);
      const deco = [e.underline && 'underline', e.strike && 'line-through', e.overline && 'overline'].filter(Boolean).join(' ');
      const px = Math.round((e.size / 100) * size.w * (e.script ? SCRIPT_SCALE : 1) * 100) / 100;
      Object.assign(css, {
        fontFamily: f.css, fontSize: px, fontWeight: e.weight, fontStyle: e.italic ? 'italic' : 'normal',
        textDecoration: deco || 'none', textTransform: kase === 'upper' ? 'uppercase' : 'none', letterSpacing: e.tracking !== undefined ? `${em}em` : `${e.letterSpacing / 10}em`,
        lineHeight: lead, textAlign: e.align, color: hexOr(e.color, rarity, AUTO_INK), overflowWrap: 'anywhere',
      });
      if (word) css.wordSpacing = `${word}em`;
      if (e.kerning === false) css.fontKerning = 'none';
      // Baseline shift and super/subscript move the whole box (one-line tokens): every renderer reads `top`.
      const lift = ((e.baseline ?? 0) / 100 + (e.script ? SCRIPT_SHIFT[e.script] : 0)) * px;
      if (lift) css.top = Math.round((Number(css.top) - lift) * 100) / 100;
      if (e.kind === 'text' && c.text) { const mt = markedText(c.text); c.text = mt.text; marks = mt.marks; }
      if (kase === 'lower') c.text = c.text?.toLowerCase();
      else if (kase === 'title') c.text = c.text ? titleCase(c.text) : c.text;
      if (f.files) font = { id: f.id, weight: e.weight, ...(e.italic ? { italic: true } : {}) };
      if (f.files && marks) {
        const faces = new Map<string, { id: string; weight: number; italic?: boolean }>();
        for (const m of marks) faces.set(`${m.bold ? 1 : 0}${m.italic ? 1 : 0}`, { id: f.id, weight: m.bold ? Math.max(e.weight, 700) : e.weight, ...(e.italic || m.italic ? { italic: true } : {}) });
        moreFonts = [...faces.values()];
      }
      const arcOn = !!e.arc && c.tag === 'p' && !!c.text;
      arcMode = arcOn;
      const plate = e.fx.plate && e.fx.plate.on !== false && !arcOn ? e.fx.plate : undefined;
      const pad = (((e.pad ?? 0) + (plate?.pad ?? 0)) / 100) * size.w;
      if (arcOn) c.text = c.text!.replace(/\s*\n\s*/g, ' ');
      if (arcOn && kase === 'upper') c.text = c.text!.toUpperCase(); // SVG text does not reliably take text-transform
      if (!arcOn && c.tag === 'p' && c.text && (e.fit || e.wrap === false || e.maxLines || e.h || e.indent || e.paraGap || e.align === 'justify' || e.pad || plate || kase === 'smallcaps' || marks || c.text.includes('\n'))) {
        spec = {
          text: c.text, size: Number(css.fontSize), minPx: ((e.minSize ?? DEFAULT_MIN_SIZE) / 100) * size.w, maxPx: 0.3 * size.w, fit: e.fit ?? null,
          boxW: Math.round((w - 2 * pad) * 100) / 100, boxH: e.h ? Math.round(((e.h / 100) * size.h - 2 * pad) * 100) / 100 : 0,
          wrap: e.wrap !== false, maxLines: e.maxLines ?? 0, indent: e.indent ?? 0, paraGap: e.paraGap ?? 0, lineHeight: lead, spacingEm: em,
          upper: kase === 'upper', justify: e.align === 'justify', family: f.css, weight: e.weight, italic: e.italic, valign: e.valign ?? 'middle', pad: Math.round(pad * 100) / 100,
          ...(marks ? { marks } : {}), ...(kase === 'smallcaps' ? { smallCaps: true } : {}), ...(word ? { wordEm: word } : {}), ...(e.kerning === false ? { kerning: false } : {}),
        };
        const lay = layoutText(spec, opts.measure ?? canvasMeasure() ?? estimateMeasure);
        lines = lay.lines;
        css.fontSize = lay.size;
        Object.assign(css, { boxSizing: 'border-box', textAlign: e.align === 'justify' ? 'left' : e.align });
        if (pad) css.padding = Math.round(pad * 100) / 100;
        if (e.h) Object.assign(css, { height: Math.round(((e.h / 100) * size.h) * 100) / 100, display: 'flex', flexDirection: 'column', justifyContent: spec.valign === 'top' ? 'flex-start' : spec.valign === 'bottom' ? 'flex-end' : 'center' });
      }
    } else {
      css.height = e.kind === 'qr' ? Math.round(w * 100) / 100 : 'auto';
    }
    const textual = e.kind !== 'qr' && e.kind !== 'logo';
    // On an arc the inner shadow and the plate are not drawn (they follow a straight box); stroke, glow, shadows, bevel and gradient are.
    const parts = effectParts(textual ? (arcMode ? { ...e.fx, inner: undefined, plate: undefined } : e.fx) : { gradientText: e.fx.gradientText }, size.w);
    const fxCss = parts.css;
    if (!textual) {
      const on = (v?: { on?: false }) => !!v && v.on !== false;
      const dl = [on(e.fx.stroke) ? `drop-shadow(0 0 1px ${e.fx.stroke!.color})` : '', on(e.fx.glow) ? `drop-shadow(0 0 ${e.fx.glow!.blur / 4}px ${e.fx.glow!.color})` : '', ...(e.fx.shadows ?? []).filter(on).map(h => `drop-shadow(${h.x / 4}px ${h.y / 4}px ${h.blur / 4}px ${h.color})`)].filter(Boolean);
      if (dl.length) css.filter = dl.join(' ');
    }
    Object.assign(css, fxCss);
    let arcGeo: ArcGeo | undefined;
    if (arcMode && c.text) {
      const px = Number(css.fontSize), g = arcGeometry(w, px, e.arc!, e.align);
      const st = e.fx.stroke, gr = e.fx.gradientText, unit = size.w / 100;
      arcGeo = { ...g, key: `arc${Math.abs(e.arc!)}${e.arc! < 0 ? 'n' : 'p'}${Math.round(w)}${Math.round(px * 10)}${e.id}` };
      if (st && st.on !== false && st.width > 0) arcGeo.stroke = { color: st.color, width: f2(st.width * unit * 0.1), outside: st.pos !== 'center' };
      if (gr && gr.on !== false) {
        const a = (gr.angle * Math.PI) / 180, half = (Math.abs(g.w * Math.sin(a)) + Math.abs(g.h * Math.cos(a))) / 2, dx = Math.sin(a) * half, dy = -Math.cos(a) * half;
        arcGeo.grad = { x1: f2(g.w / 2 - dx), y1: f2(g.h / 2 - dy), x2: f2(g.w / 2 + dx), y2: f2(g.h / 2 + dy), stops: gr.stops ? gr.stops.map(x => ({ c: x.color, at: x.at })) : [{ c: gr.from, at: 0 }, { c: gr.to, at: 100 }] };
      }
      // A text-shadow on the wrapper would not reach the SVG's glyphs the same way everywhere: draw them as a drop-shadow filter (its blur is a deviation, half the shadow's radius).
      const ts = typeof css.textShadow === 'string' && css.textShadow !== 'none' ? css.textShadow : '';
      if (ts && !css.filter) {
        arcGeo.filter = ts.split(/,(?![^(]*\))/).map(p => { const m = /^\s*(\S+)\s+(\S+)\s+(\S+)\s+(.+?)\s*$/.exec(p); return m ? `drop-shadow(${m[1]} ${m[2]} ${f2(parseFloat(m[3]) / 2)}px ${m[4]})` : ''; }).filter(Boolean).join(' ');
      }
      css.height = 'auto';
    }
    free.push({ id: e.id, kind: e.kind, mode: 'free', tag: c.tag ?? 'p', cls: '', ...c, vars: {}, css, ...(font ? { font } : {}), ...(moreFonts ? { moreFonts } : {}), ...(spec ? { spec, lines } : {}), ...(parts.inner ? { inner: parts.inner } : {}), ...(parts.shadow ? { shadow: parts.shadow } : {}), ...(arcGeo ? { arc: arcGeo } : {}), ...(parts.plate ? { plate: parts.plate } : {}), ...(e.kind === 'qr' && e.dark !== 'auto' ? { dark: e.dark } : {}), ...(e.kind === 'qr' && e.light !== 'auto' ? { light: e.light } : {}), z: e.z, order });
  });
  free.sort((a, b) => a.z - b.z || a.order - b.order);
  return [...stack, ...free.map(({ z: _z, order: _o, ...n }) => { void _z; void _o; return n; })];
}

/** The curated font files the nodes need, as `{ id, weight, italic? }` (deduplicated). */
export function fontsNeeded(nodes: BackNode[]): { id: string; weight: number; italic?: boolean }[] {
  const seen = new Map<string, { id: string; weight: number; italic?: boolean }>();
  for (const n of nodes) for (const f of [n.font, ...(n.moreFonts ?? [])]) if (f) seen.set(`${f.id}:${f.weight}:${f.italic ? 'i' : ''}`, f);
  return [...seen.values()];
}

/** The CSS of one drawn line (a block, so the box's flex or text alignment places it). Keep widget.js's backLineStyle in step. */
export function lineCss(l: TextLine): Record<string, string | number> {
  return { display: 'block', whiteSpace: 'nowrap', ...(l.i ? { marginLeft: l.i } : {}), ...(l.g ? { marginTop: l.g } : {}), ...(l.j ? { textAlignLast: 'justify' } : {}) };
}
