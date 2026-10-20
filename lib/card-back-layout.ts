// The back's layout engine (ROADMAP 20.3a): a design and a print in, positioned nodes with their final styles out. Pure and client-safe.
// The DOM renderer (FlipCard) draws these nodes; the canvas and overlay renderers of 20.3c draw the same list, so every place shows the
// same design. STACK nodes are laid out by the plate's own CSS (today's centred column), FREE nodes carry final pixel positions.
import { BACK_FONTS, type BackEl, type CardBackStyle, type Effects } from './card-back';
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
  /** Fonts this node needs loaded (curated ids with files). */
  font?: { id: string; weight: number };
}

export interface LayoutOptions { compact?: boolean }

const hexOr = (c: string, rarity: string, auto: string) => (c === 'rarity' ? rarity : c === 'auto' ? auto : c);
const AUTO_INK = '#1c1c24';

/** Template placeholders; unknown ones are dropped. */
export function resolveTemplate(t: string, back: FlipBack, style: CardBackStyle): string {
  const vars: Record<string, string> = {
    pack: style.packName ?? '', season: style.seasonName ?? '', card: back.name, version: back.variantLabel, edition: String(back.n),
    printNumber: String(back.uid ?? back.n), holder: back.holder ?? '', date: back.date ?? '',
  };
  return t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '').replace(/\s+/g, ' ').trim();
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
    css.backgroundImage = `linear-gradient(${fx.gradientText.angle}deg, ${fx.gradientText.from}, ${fx.gradientText.to})`;
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
  const have = Object.keys(f.files).map(Number);
  const want = STACK_PAINT_800.has(e.kind) ? 800 : 400;
  const weight = have.reduce((best, n) => (Math.abs(n - want) < Math.abs(best - want) ? n : best), have[0]);
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
    if (e.kind !== 'qr' && e.kind !== 'logo') {
      const f = BACK_FONTS.find(x => x.id === e.font) ?? BACK_FONTS[0];
      Object.assign(css, {
        fontFamily: f.css, fontSize: Math.round((e.size / 100) * size.w * 100) / 100, fontWeight: e.weight, fontStyle: e.italic ? 'italic' : 'normal',
        textDecoration: e.underline ? 'underline' : 'none', textTransform: e.uppercase ? 'uppercase' : 'none', letterSpacing: `${e.letterSpacing / 10}em`,
        lineHeight: e.lineHeight, textAlign: e.align, color: hexOr(e.color, rarity, AUTO_INK), overflowWrap: 'anywhere',
      });
      if (f.files) font = { id: f.id, weight: e.weight };
    } else {
      css.height = e.kind === 'qr' ? Math.round(w * 100) / 100 : 'auto';
    }
    const fxCss = effectsCss(e.fx, rarity, size.w);
    if (e.kind === 'qr' || e.kind === 'logo') { delete fxCss.WebkitTextStroke; delete fxCss.paintOrder; delete fxCss.textShadow; if (e.fx.glow || e.fx.shadow || e.fx.outline) css.filter = [e.fx.outline ? `drop-shadow(0 0 1px ${e.fx.outline.color})` : '', e.fx.glow ? `drop-shadow(0 0 ${e.fx.glow.blur / 4}px ${e.fx.glow.color})` : '', e.fx.shadow ? `drop-shadow(${e.fx.shadow.x / 4}px ${e.fx.shadow.y / 4}px ${e.fx.shadow.blur / 4}px ${e.fx.shadow.color})` : ''].filter(Boolean).join(' '); }
    Object.assign(css, fxCss);
    free.push({ id: e.id, kind: e.kind, mode: 'free', tag: c.tag ?? 'p', cls: '', ...c, vars: {}, css, ...(font ? { font } : {}), ...(e.kind === 'qr' && e.dark !== 'auto' ? { dark: e.dark } : {}), ...(e.kind === 'qr' && e.light !== 'auto' ? { light: e.light } : {}), z: e.z, order });
  });
  free.sort((a, b) => a.z - b.z || a.order - b.order);
  return [...stack, ...free.map(({ z: _z, order: _o, ...n }) => { void _z; void _o; return n; })];
}

/** The curated font files the nodes need, as `{ id, weight }` (deduplicated). */
export function fontsNeeded(nodes: BackNode[]): { id: string; weight: number }[] {
  const seen = new Map<string, { id: string; weight: number }>();
  for (const n of nodes) if (n.font) seen.set(`${n.font.id}:${n.font.weight}`, n.font);
  return [...seen.values()];
}
