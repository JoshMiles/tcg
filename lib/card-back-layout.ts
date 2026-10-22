// The back's layout engine (ROADMAP 20.3a): a design and a print in, positioned nodes with their final styles out. Pure and client-safe.
// The DOM renderer (FlipCard) draws these nodes; the canvas and overlay renderers of 20.3c draw the same list, so every place shows the
// same design. STACK nodes are laid out by the plate's own CSS (today's centred column), FREE nodes carry final pixel positions.
import { BACK_FONTS, nearestWeight, type BackEl, type CardBackStyle, type Effects } from './card-back';
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
}

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
export interface TextLine { t: string; i: number; g: number; j: boolean }

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
  const glyphs = (t: string) => (s.smallCaps ? capRuns(t).reduce((a, r) => a + (measure(r.t, face) / 100) * (r.s ? SMALLCAP_SCALE : 1), 0) : measure(s.upper ? t.toUpperCase() : t, face) / 100);
  const wid = (t: string, size: number) => (glyphs(t) + t.length * s.spacingEm + (t.split(' ').length - 1) * (s.wordEm ?? 0)) * size;
  const flow = (size: number) => {
    const lines: TextLine[] = [];
    s.text.split('\n').forEach((para, pi) => {
      const words = para.split(' ').filter(Boolean);
      const ind = s.indent * size, gap = pi ? s.paraGap * size : 0;
      const start = lines.length;
      const meta = (j: boolean) => (lines.length === start ? { i: ind, g: gap, j } : { i: 0, g: 0, j });
      if (!s.wrap || words.length <= 1) { lines.push({ t: words.join(' '), ...meta(false) }); return; }
      let line = '';
      for (const w of words) {
        const next = line ? line + ' ' + w : w;
        if (line && wid(next, size) > s.boxW - (lines.length === start ? ind : 0)) { lines.push({ t: line, ...meta(s.justify) }); line = w; } else line = next;
      }
      lines.push({ t: line, ...meta(false) });
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
      while (t && wid(t + '…', size) > s.boxW - last.i) t = t.slice(0, -1).trimEnd();
      last.t = t + '…'; last.j = false;
    }
    let widest = 0;
    for (const l of lines) widest = Math.max(widest, wid(l.t, size) + l.i);
    return { lines, cut, widest };
  };
  const round = (n: number) => Math.round(n * 100) / 100;
  if (s.fit === 'width') {
    const t = s.text.replace(/\n/g, ' ').replace(/ +/g, ' ').trim();
    const unit = wid(t, 1);
    if (!(unit > 0) || !(s.boxW > 0)) return { size: s.size, lines: [{ t, i: 0, g: 0, j: false }] };
    return { size: round(Math.max(Math.min(s.minPx, s.maxPx), Math.min(s.maxPx, (s.boxW * 0.99) / unit))), lines: [{ t, i: 0, g: 0, j: false }] };
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

/** The CSS for an element's effects (outline, glow, shadow, engrave, gradient text) at a card width in px. */
export function effectsCss(fx: Effects, hex: string, cardW: number): Record<string, string | number> {
  const css: Record<string, string | number> = {};
  const shadows: string[] = [];
  const unit = cardW / 100;
  if (fx.outline && fx.outline.width > 0) { css.WebkitTextStroke = `${Math.round(fx.outline.width * unit * 0.1 * 100) / 100}px ${fx.outline.color}`; css.paintOrder = 'stroke fill'; }
  if (fx.glow) for (let i = 0; i < Math.ceil(fx.glow.strength); i++) shadows.push(`0 0 ${Math.round(fx.glow.blur * unit * 0.25 * 100) / 100}px ${fx.glow.color}`);
  if (fx.shadow) shadows.push(`${Math.round(fx.shadow.x * unit * 0.25 * 100) / 100}px ${Math.round(fx.shadow.y * unit * 0.25 * 100) / 100}px ${Math.round(fx.shadow.blur * unit * 0.25 * 100) / 100}px ${fx.shadow.color}`);
  if (fx.engrave) shadows.push('0 1px 0 rgba(255,255,255,.55)', '0 -1px 1px rgba(0,0,0,.4)');
  if (shadows.length) css.textShadow = shadows.join(', ');
  if (fx.gradientText) {
    const g = fx.gradientText;
    css.backgroundImage = `linear-gradient(${g.angle}deg, ${g.stops ? g.stops.map(x => `${x.color} ${x.at}%`).join(', ') : `${g.from}, ${g.to}`})`;
    css.WebkitBackgroundClip = 'text'; css.backgroundClip = 'text'; css.color = 'transparent'; css.WebkitTextFillColor = 'transparent';
  }
  void hex;
  return css;
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
      if (!c && !isFoot) return;
      const vars: Record<string, string> = {};
      let css: Record<string, string | number> = {};
      if (c) {
        const textual = e.kind !== 'qr' && e.kind !== 'logo';
        const ink = e.color === 'auto' ? null : hexOr(e.color, rarity, AUTO_INK);
        if (textual && ink && !(e.kind === 'number' && c.cls?.includes('gold'))) vars[e.kind === 'brand' || e.kind === 'link' ? '--accent-ink' : '--ink'] = ink;
        if (textual && !e.fx.engrave) vars['--ink-shadow'] = 'none';
        const { engrave: _g, ...extra } = e.fx; void _g;
        if (Object.keys(extra).length) css = effectsCss(extra, rarity, size.w);
        if (e.scale !== 1 && ['number', 'edition', 'name', 'date', 'origin', 'history', 'qr', 'brand'].includes(e.kind)) vars[`--k-${e.kind}`] = String(e.scale);
        if (e.kind === 'logo') vars['--logo-px'] = `${e.px}px`;
      }
      const font = c ? stackFace(e, vars, css) : undefined;
      stack.push({ id: e.id, kind: e.kind, mode: 'stack', tag: c?.tag ?? 'empty', cls: c?.cls ?? '', ...c, vars, css, ...(font ? { font } : {}), ...(e.kind === 'qr' && e.dark !== 'auto' ? { dark: e.dark } : {}), ...(e.kind === 'qr' && e.light !== 'auto' ? { light: e.light } : {}) });
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
    let spec: TextSpec | undefined;
    let lines: TextLine[] | undefined;
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
      if (kase === 'lower') c.text = c.text?.toLowerCase();
      else if (kase === 'title') c.text = c.text ? titleCase(c.text) : c.text;
      if (f.files) font = { id: f.id, weight: e.weight, ...(e.italic ? { italic: true } : {}) };
      const pad = ((e.pad ?? 0) / 100) * size.w;
      if (c.tag === 'p' && c.text && (e.fit || e.wrap === false || e.maxLines || e.h || e.indent || e.paraGap || e.align === 'justify' || e.pad || kase === 'smallcaps' || c.text.includes('\n'))) {
        spec = {
          text: c.text, size: Number(css.fontSize), minPx: ((e.minSize ?? DEFAULT_MIN_SIZE) / 100) * size.w, maxPx: 0.3 * size.w, fit: e.fit ?? null,
          boxW: Math.round((w - 2 * pad) * 100) / 100, boxH: e.h ? Math.round(((e.h / 100) * size.h - 2 * pad) * 100) / 100 : 0,
          wrap: e.wrap !== false, maxLines: e.maxLines ?? 0, indent: e.indent ?? 0, paraGap: e.paraGap ?? 0, lineHeight: lead, spacingEm: em,
          upper: kase === 'upper', justify: e.align === 'justify', family: f.css, weight: e.weight, italic: e.italic, valign: e.valign ?? 'middle', pad: Math.round(pad * 100) / 100,
          ...(kase === 'smallcaps' ? { smallCaps: true } : {}), ...(word ? { wordEm: word } : {}), ...(e.kerning === false ? { kerning: false } : {}),
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
    const fxCss = effectsCss(e.fx, rarity, size.w);
    if (e.kind === 'qr' || e.kind === 'logo') { delete fxCss.WebkitTextStroke; delete fxCss.paintOrder; delete fxCss.textShadow; if (e.fx.glow || e.fx.shadow || e.fx.outline) css.filter = [e.fx.outline ? `drop-shadow(0 0 1px ${e.fx.outline.color})` : '', e.fx.glow ? `drop-shadow(0 0 ${e.fx.glow.blur / 4}px ${e.fx.glow.color})` : '', e.fx.shadow ? `drop-shadow(${e.fx.shadow.x / 4}px ${e.fx.shadow.y / 4}px ${e.fx.shadow.blur / 4}px ${e.fx.shadow.color})` : ''].filter(Boolean).join(' '); }
    Object.assign(css, fxCss);
    free.push({ id: e.id, kind: e.kind, mode: 'free', tag: c.tag ?? 'p', cls: '', ...c, vars: {}, css, ...(font ? { font } : {}), ...(spec ? { spec, lines } : {}), ...(e.kind === 'qr' && e.dark !== 'auto' ? { dark: e.dark } : {}), ...(e.kind === 'qr' && e.light !== 'auto' ? { light: e.light } : {}), z: e.z, order });
  });
  free.sort((a, b) => a.z - b.z || a.order - b.order);
  return [...stack, ...free.map(({ z: _z, order: _o, ...n }) => { void _z; void _o; return n; })];
}

/** The curated font files the nodes need, as `{ id, weight, italic? }` (deduplicated). */
export function fontsNeeded(nodes: BackNode[]): { id: string; weight: number; italic?: boolean }[] {
  const seen = new Map<string, { id: string; weight: number; italic?: boolean }>();
  for (const n of nodes) if (n.font) seen.set(`${n.font.id}:${n.font.weight}:${n.font.italic ? 'i' : ''}`, n.font);
  return [...seen.values()];
}

/** The CSS of one drawn line (a block, so the box's flex or text alignment places it). Keep widget.js's backLineStyle in step. */
export function lineCss(l: TextLine): Record<string, string | number> {
  return { display: 'block', whiteSpace: 'nowrap', ...(l.i ? { marginLeft: l.i } : {}), ...(l.g ? { marginTop: l.g } : {}), ...(l.j ? { textAlignLast: 'justify' } : {}) };
}
