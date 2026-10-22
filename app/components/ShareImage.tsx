'use client';
import { useState } from 'react';
import { Icon } from './Icon';
import {
  SHARE_W, HEADER_H, BIG_STATS_H, cardArea, cardAreaWithPlate, cardAreaWithStats, plateRect, layoutCards, formatHeight, getShareTheme, binderLayout, statsLayout,
  type BinderShare, type BinderShareSlot, type Rect, type ShareSpec, type ShareTheme,
} from '@/lib/share-image';
import { qrModules } from '@/lib/qr';
import { DEFAULT_CARD_BACK, plateLook } from '@/lib/card-back';
import { SMALLCAP_SCALE, capRuns, fontsNeeded, layoutBack } from '@/lib/card-back-layout';
import { markPieces } from '@/lib/text-markup';
import { loadBackFonts } from '@/lib/card-back-fonts';
import { CANVAS_BACK_REF, canvasPattern, placeBack, wrapText, type BackBox } from '@/lib/card-back-canvas';

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
/** Loads (and remembers) an image, so changing a theme doesn't fetch and decode the same art again. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  const hit = imageCache.get(src);
  if (hit) return hit;
  const p = new Promise<HTMLImageElement | null>(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => { imageCache.delete(src); resolve(null); };
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Letter-spacing where the browser supports it (the property is newer than the rest of the canvas API). */
function spaced(ctx: CanvasRenderingContext2D, px: number) {
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

const NUMBER_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** The engraved metal plate under a single copy's card: a slim bevelled plate, small spaced lettering cut into it, rivets and a QR code. */
function drawPlate(ctx: CanvasRenderingContext2D, p: NonNullable<ShareSpec['plate']>, rarityEdge: string, font: string, t: ShareTheme, h: number) {
  const r = plateRect(h);
  const look = p.look;
  const pl = look ? { ...t.plate, ...(look.stops ? { stops: look.stops, dark: !!look.dark } : {}), ...(look.ink ? { ink: look.ink } : {}) } : t.plate;
  const edge = look?.edge ?? rarityEdge;
  ctx.save();
  ctx.shadowColor = edge; ctx.shadowBlur = 24;
  const metal = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  metal.addColorStop(0, pl.stops[0]); metal.addColorStop(0.36, pl.stops[1]); metal.addColorStop(0.62, pl.stops[2]); metal.addColorStop(1, pl.stops[3]);
  ctx.fillStyle = metal; roundRect(ctx, r.x, r.y, r.w, r.h, 20); ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, 20); ctx.clip();
  // Brushed lines.
  ctx.fillStyle = pl.dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.2)';
  for (let x = r.x; x < r.x + r.w; x += 4) ctx.fillRect(x, r.y, 1, r.h);
  // A soft sheen across the top half, like light on a bevel.
  const sheen = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  sheen.addColorStop(0, pl.dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.28)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = sheen; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
  ctx.strokeStyle = edge; ctx.lineWidth = 4; roundRect(ctx, r.x, r.y, r.w, r.h, 20); ctx.stroke();
  // An inset bevel: a dark hairline with a light one under it.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = pl.lo; roundRect(ctx, r.x + 10, r.y + 10, r.w - 20, r.h - 20, 12); ctx.stroke();
  ctx.strokeStyle = pl.hi; roundRect(ctx, r.x + 11.5, r.y + 11.5, r.w - 20, r.h - 20, 12); ctx.stroke();
  // Rivets.
  for (const [rx, ry] of [[r.x + 28, r.y + 28], [r.x + r.w - 28, r.y + 28], [r.x + 28, r.y + r.h - 28], [r.x + r.w - 28, r.y + r.h - 28]]) {
    const g = ctx.createRadialGradient(rx - 2, ry - 2, 1, rx, ry, 7);
    g.addColorStop(0, pl.hi); g.addColorStop(1, pl.rivet);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(rx, ry, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = pl.lo; ctx.lineWidth = 1; ctx.stroke();
  }

  const padL = 62;
  const show = look?.show;
  const qr = p.qrUrl && (!show || show.qr) ? qrModules(p.qrUrl) : null;
  const qrSize = 132;
  const textW = r.w - padL - 40 - (qr ? qrSize + 70 : 0);
  const left = r.x + padL;

  // Engraved lettering: a light edge below and a dark edge above, so it looks cut into the metal.
  const engrave = (text: string, x: number, y: number, size: number, weight: number, fill: string, maxW: number, family = font, spacing = 0) => {
    ctx.font = `${weight} ${size}px ${family}`; ctx.textAlign = 'left'; spaced(ctx, spacing);
    ctx.fillStyle = pl.hi; ctx.fillText(text, x, y + 1.5, maxW);
    ctx.fillStyle = pl.lo; ctx.fillText(text, x, y - 1, maxW);
    ctx.fillStyle = fill; ctx.fillText(text, x, y, maxW);
    spaced(ctx, 0);
  };

  engrave('THE CHEESY TCG  ·  EDITION', left, r.y + 46, 16, 800, pl.ink, textW, font, 3);
  // A fine rule under the label.
  ctx.fillStyle = pl.lo; ctx.fillRect(left, r.y + 58, textW, 1);
  ctx.fillStyle = pl.hi; ctx.fillRect(left, r.y + 59, textW, 1);

  // The number: small "No." and the digits in a tabular face, much quieter than before.
  const digits = p.number.replace(/^#/, '');
  const nx = left + 50;
  if (!show || show.number) engrave('No.', left, r.y + 110, 20, 800, pl.ink, 60, font, 2);
  if (show && !show.number) { /* number left off this pack's back */ } else {
  ctx.font = `700 52px ${NUMBER_FONT}`; spaced(ctx, 3);
  if (p.gold) {
    const g = ctx.createLinearGradient(0, r.y + 66, 0, r.y + 114);
    g.addColorStop(0, '#f7d56b'); g.addColorStop(0.5, '#e0a81c'); g.addColorStop(1, '#8a5a00');
    ctx.fillStyle = pl.hi; ctx.fillText(digits, nx, r.y + 111.5, textW - 50);
    ctx.fillStyle = 'rgba(60,35,0,0.55)'; ctx.fillText(digits, nx, r.y + 109, textW - 50);
    ctx.fillStyle = g; ctx.fillText(digits, nx, r.y + 110, textW - 50);
    spaced(ctx, 0);
  } else {
    spaced(ctx, 0);
    engrave(digits, nx, r.y + 110, 52, 700, pl.ink, textW - 50, NUMBER_FONT, 3);
  }
  }
  if (!show || show.edition) engrave(p.edition, left, r.y + 146, 23, 700, pl.ink, textW);
  const bits = [(!show || show.date) ? p.date : undefined, ...((!show || show.origin) ? p.lines ?? [] : [])].filter(Boolean) as string[];
  if (bits.length) engrave(bits.slice(0, 2).join('   ·   '), left, r.y + 176, 17, 700, pl.ink, textW, font, 1);

  if (qr) {
    const q = r.x + r.w - 62 - qrSize, qy = r.y + (r.h - qrSize) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.94)'; roundRect(ctx, q - 8, qy - 8, qrSize + 16, qrSize + 16, 10); ctx.fill();
    const cell = qrSize / (qr.size + 2);
    ctx.fillStyle = '#1f1f24';
    for (let row = 0; row < qr.size; row++) for (let col = 0; col < qr.size; col++) if (qr.dark(row, col)) ctx.fillRect(q + (col + 1) * cell, qy + (row + 1) * cell, Math.ceil(cell), Math.ceil(cell));
  }
}

/** One box of the back: text with its outline, shadows, glow and gradient, an image, or a QR code. Drawn in the reference card's px (the context is scaled). */
function drawBackBox(ctx: CanvasRenderingContext2D, b: BackBox, family: string, images: Map<string, HTMLImageElement | null>) {
  ctx.save();
  ctx.globalAlpha = b.opacity;
  if (b.rotate) { ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.rotate((b.rotate * Math.PI) / 180); ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2)); }
  if (b.type === 'img') {
    const img = b.src ? images.get(b.src) : null;
    if (img) { const k = Math.min(b.w / img.width, b.h / img.height); ctx.drawImage(img, b.x + (b.w - img.width * k) / 2, b.y + (b.h - img.height * k) / 2, img.width * k, img.height * k); }
  } else if (b.type === 'qr' && b.qrUrl && qrModules(b.qrUrl)) {
    const q = qrModules(b.qrUrl)!;
    const cell = b.w / (q.size + 2);
    ctx.fillStyle = b.light ?? 'rgba(255,255,255,0.88)'; roundRect(ctx, b.x, b.y, b.w, b.h, 3); ctx.fill();
    ctx.fillStyle = b.dark ?? '#1f1f24';
    for (let row = 0; row < q.size; row++) for (let col = 0; col < q.size; col++) if (q.dark(row, col)) ctx.fillRect(b.x + (col + 1) * cell, b.y + (row + 1) * cell, cell + 0.4, cell + 0.4);
  } else if (b.type === 'text' || b.type === 'hist') {
    const f = b.font;
    if (b.plate) {
      const o = b.plate.outline;
      roundRect(ctx, b.x, b.y, b.w, b.h, b.plate.radius);
      ctx.fillStyle = b.plate.color; ctx.fill();
      // The DOM draws the outline as a box-shadow spread, outside the box.
      if (o) { roundRect(ctx, b.x - o.width / 2, b.y - o.width / 2, b.w + o.width, b.h + o.width, b.plate.radius + o.width / 2); ctx.strokeStyle = o.color; ctx.lineWidth = o.width; ctx.stroke(); }
    }
    ctx.font = `${f.italic ? 'italic ' : ''}${f.weight} ${f.size}px ${f.family ?? family}`;
    ctx.textBaseline = 'middle'; ctx.textAlign = f.align;
    spaced(ctx, f.spacing);
    const cx2 = ctx as CanvasRenderingContext2D & { fontKerning?: string; wordSpacing?: string };
    cx2.fontKerning = f.kerning === false ? 'none' : 'auto';
    if ('wordSpacing' in ctx) cx2.wordSpacing = `${f.wordSpacing ?? 0}px`;
    const pad = b.lines ? b.pad ?? 0 : 0;
    const maxW = b.w - 2 * pad;
    const x = f.align === 'left' ? b.x + pad : f.align === 'right' ? b.x + b.w - pad : b.x + b.w / 2;
    const fam = f.family ?? family;
    // The markup piece being drawn: bold and italic change the face (and so the widths), colour only the fill.
    const cur = { bold: false, italic: false };
    let ink = b.color;
    const fontAt = (small: boolean) => `${f.italic || cur.italic ? 'italic ' : ''}${cur.bold ? Math.max(f.weight, 700) : f.weight} ${small ? f.size * SMALLCAP_SCALE : f.size}px ${fam}`;
    const runsOf = (text: string) => (f.smallCaps ? capRuns(text) : [{ t: f.upper ? text.toUpperCase() : text, s: false }]);
    const textW = (text: string) => { const w = runsOf(text).reduce((a, r) => { ctx.font = fontAt(r.s); return a + ctx.measureText(r.t).width; }, 0); ctx.font = fontAt(false); return w; };
    // Canvas shadows are in device px, not the scaled drawing's px.
    const m = ctx.getTransform(), sc = Math.hypot(m.a, m.b) || 1;
    const paint = (s: string, tx: number, ty: number, align: CanvasTextAlign, size: number) => {
      ctx.textAlign = align;
      for (const sh of b.shadows) {
        ctx.save(); ctx.shadowColor = sh.color; ctx.shadowOffsetX = sh.x * sc; ctx.shadowOffsetY = sh.y * sc; ctx.shadowBlur = sh.blur * sc;
        ctx.fillStyle = b.gradient ? 'rgba(0,0,0,0)' : ink; ctx.fillText(s, tx, ty, maxW); ctx.restore();
      }
      // An outside stroke is painted under the letters (like paint-order: stroke), so only its outer half shows; a centred one is painted over them below.
      const strokeIt = () => { ctx.save(); ctx.lineWidth = b.stroke!.width; ctx.strokeStyle = b.stroke!.color; ctx.lineJoin = 'round'; ctx.strokeText(s, tx, ty, maxW); ctx.restore(); };
      if (b.stroke?.outside) strokeIt();
      if (b.gold) { const g = ctx.createLinearGradient(0, ty - size / 2, 0, ty + size / 2); g.addColorStop(0, '#e0a81c'); g.addColorStop(0.45, '#f7d56b'); g.addColorStop(1, '#8a5a00'); ctx.fillStyle = g; }
      else if (b.gradient) {
        const a = (b.gradient.angle * Math.PI) / 180, dx = Math.sin(a) * b.w / 2, dy = -Math.cos(a) * f.size;
        const cx = b.x + b.w / 2;
        const g = ctx.createLinearGradient(cx - dx, ty - dy, cx + dx, ty + dy);
        for (const st of b.gradient.stops ?? [{ color: b.gradient.from, at: 0 }, { color: b.gradient.to, at: 100 }]) g.addColorStop(Math.min(1, Math.max(0, st.at / 100)), st.color);
        ctx.fillStyle = g;
      } else ctx.fillStyle = ink;
      ctx.fillText(s, tx, ty, maxW);
      if (b.stroke && !b.stroke.outside) strokeIt();
      if (b.inner) innerShadow(s, tx, ty, align);
    };
    // The inner shadow: the shadow colour everywhere, cut out by the letters shifted and blurred, kept only inside the letters.
    let tmp: HTMLCanvasElement | null = null;
    const innerShadow = (s: string, tx: number, ty: number, align: CanvasTextAlign) => {
      const c = ctx.canvas, sh = b.inner!;
      tmp ??= document.createElement('canvas');
      if (tmp.width !== c.width || tmp.height !== c.height) { tmp.width = c.width; tmp.height = c.height; }
      const t = tmp.getContext('2d');
      if (!t) return;
      t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, c.width, c.height);
      t.fillStyle = sh.color; t.fillRect(0, 0, c.width, c.height);
      t.setTransform(m);
      t.font = ctx.font; t.textBaseline = ctx.textBaseline; t.textAlign = align;
      const t2 = t as CanvasRenderingContext2D & { fontKerning?: string; wordSpacing?: string };
      spaced(t, f.spacing); t2.fontKerning = cx2.fontKerning; if ('wordSpacing' in t) t2.wordSpacing = cx2.wordSpacing;
      const far = 4000;
      t.globalCompositeOperation = 'destination-out';
      t.shadowColor = '#000'; t.shadowOffsetX = (far + sh.x) * sc; t.shadowOffsetY = sh.y * sc; t.shadowBlur = sh.blur * sc;
      t.fillText(s, tx - far, ty, maxW);
      t.shadowColor = 'rgba(0,0,0,0)'; t.shadowOffsetX = 0; t.shadowOffsetY = 0; t.shadowBlur = 0;
      t.globalCompositeOperation = 'destination-in'; t.fillStyle = '#000';
      t.fillText(s, tx, ty, maxW);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(tmp, 0, 0); ctx.restore();
    };
    const fill = (text: string, tx: number, ty: number, align: CanvasTextAlign) => {
      const runs = runsOf(text);
      ctx.font = fontAt(false);
      if (runs.length === 1 && !runs[0].s) paint(runs[0].t, tx, ty, align, f.size);
      else {
        const ws = runs.map(r => { ctx.font = fontAt(r.s); return ctx.measureText(r.t).width; });
        const total = ws.reduce((a, n) => a + n, 0);
        let rx = align === 'center' ? tx - total / 2 : align === 'right' ? tx - total : tx;
        runs.forEach((r, i) => { ctx.font = fontAt(r.s); paint(r.t, rx, ty, 'left', r.s ? f.size * SMALLCAP_SCALE : f.size); rx += ws[i]; });
        ctx.font = fontAt(false);
      }
      if (f.underline || f.strike || f.overline) {
        const w = Math.min(maxW, textW(text)), ux = align === 'center' ? tx - w / 2 : align === 'right' ? tx - w : tx, th = Math.max(1, f.size / 14);
        if (f.underline) ctx.fillRect(ux, ty + f.size * 0.45, w, th);
        if (f.strike) ctx.fillRect(ux, ty + f.size * 0.05, w, th);
        if (f.overline) ctx.fillRect(ux, ty - f.size * 0.5, w, th);
      }
    };
    // A line (or word) with markup: its pieces drawn one after another, each in its own face and colour. `o` is where it starts in the plain text.
    const richPieces = (text: string, o: number, ell?: boolean) => (b.marks ? markPieces(text, o, b.marks, ell) : [{ t: text }]);
    const withPiece = <T,>(p: { bold?: boolean; italic?: boolean; color?: string }, fn: () => T): T => {
      cur.bold = !!p.bold; cur.italic = !!p.italic; ink = p.color && !b.gradient && !b.gold ? p.color : b.color;
      try { return fn(); } finally { cur.bold = false; cur.italic = false; ink = b.color; ctx.font = fontAt(false); }
    };
    const richW = (text: string, o: number, ell?: boolean) => richPieces(text, o, ell).reduce((a, p) => a + withPiece(p, () => textW(p.t)), 0);
    const fillRich = (text: string, o: number, tx: number, ty: number, align: CanvasTextAlign, ell?: boolean) => {
      if (!b.marks) { fill(text, tx, ty, align); return; }
      const ps = richPieces(text, o, ell), total = ps.reduce((a, p) => a + withPiece(p, () => textW(p.t)), 0);
      let rx = align === 'center' ? tx - total / 2 : align === 'right' ? tx - total : tx;
      for (const p of ps) { const w = withPiece(p, () => textW(p.t)); withPiece(p, () => fill(p.t, rx, ty, 'left')); rx += w; }
    };
    // Text on a curve: each glyph is placed on the circle (the DOM's textPath does the same) and drawn upright to it, one pass per effect so shadows never sit over a neighbour's letters.
    const arcText = (a: NonNullable<BackBox['arc']>, text: string) => {
      const up = a.sweep > 0, theta = Math.abs(a.sweep), L = theta * a.r;
      const reach = (i: number) => ctx.measureText(text.slice(0, i)).width;
      const t0 = a.off * (L - reach(text.length));
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
      const glyphs = [...text].map((ch, i) => ({ ch, t: t0 + (reach(i) + reach(i + 1)) / 2 })).filter(g => g.ch.trim());
      const at = (g: { t: number }) => { const phi = g.t / a.r - theta / 2; return { x: b.x + a.w / 2 + a.r * Math.sin(phi), y: b.y + (up ? a.ym + a.r * (1 - Math.cos(phi)) : a.ym - a.r * (1 - Math.cos(phi))), rot: up ? phi : -phi }; };
      const each = (fn: (ch: string, p: { x: number; y: number; rot: number }) => void) => glyphs.forEach(g => { const p = at(g); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); fn(g.ch, p); ctx.restore(); });
      for (const sh of b.shadows) each(ch => { ctx.shadowColor = sh.color; ctx.shadowOffsetX = sh.x * sc; ctx.shadowOffsetY = sh.y * sc; ctx.shadowBlur = sh.blur * sc; ctx.fillStyle = b.gradient ? b.gradient.from : b.color; ctx.fillText(ch, 0, 0); });
      const strokeAll = () => each(ch => { ctx.lineWidth = b.stroke!.width; ctx.strokeStyle = b.stroke!.color; ctx.lineJoin = 'round'; ctx.strokeText(ch, 0, 0); });
      if (b.stroke?.outside) strokeAll();
      // The gradient is laid across the whole text box; each glyph is rotated, so its endpoints are mapped back into the glyph's own space.
      const gr = b.gradient;
      const fillStyle = (p: { x: number; y: number; rot: number }): string | CanvasGradient => {
        if (!gr) return b.color;
        const ang = (gr.angle * Math.PI) / 180, half = (Math.abs(a.w * Math.sin(ang)) + Math.abs(a.h * Math.cos(ang))) / 2, dx = Math.sin(ang) * half, dy = -Math.cos(ang) * half;
        const cx = b.x + a.w / 2, cy = b.y + a.h / 2, c = Math.cos(p.rot), sn = Math.sin(p.rot);
        const local = (X: number, Y: number) => ({ x: (X - p.x) * c + (Y - p.y) * sn, y: -(X - p.x) * sn + (Y - p.y) * c });
        const p0 = local(cx - dx, cy - dy), p1 = local(cx + dx, cy + dy);
        const g = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
        for (const st of gr.stops ?? [{ color: gr.from, at: 0 }, { color: gr.to, at: 100 }]) g.addColorStop(Math.min(1, Math.max(0, st.at / 100)), st.color);
        return g;
      };
      each((ch, p) => { ctx.fillStyle = fillStyle(p); ctx.fillText(ch, 0, 0); });
      if (b.stroke && !b.stroke.outside) strokeAll();
    };
    if (b.arc && b.text) arcText(b.arc, b.text);
    else if (b.type === 'hist') {
      (b.items ?? []).forEach((h, i) => {
        const ty = b.y + i * (f.size * f.lineHeight + 1) + f.size * f.lineHeight / 2;
        fill(h.text, b.x, ty, 'left');
        fill(h.date, b.x + b.w, ty, 'right');
      });
    } else if (b.lines) {
      // Lines the layout engine already broke (the DOM draws the same ones): placed by the box's vertical align, justified lines spread their words.
      const lh = f.size * f.lineHeight;
      const content = b.lines.reduce((a, l) => a + lh + l.g, 0);
      const room = b.h - 2 * pad - content;
      let ty = b.y + pad + (b.valign === 'top' ? 0 : b.valign === 'bottom' ? room : room / 2);
      for (const l of b.lines) {
        ty += l.g;
        const x0 = b.x + pad + l.i, iw = maxW - l.i, cy = ty + lh / 2;
        const words = l.j ? l.t.split(' ') : [];
        if (l.j && words.length > 1) {
          let wo = l.o ?? 0;
          const offs = words.map(w => { const at = wo; wo += w.length + 1; return at; });
          const ws = words.map((w, k) => richW(w, offs[k]));
          const gap = (iw - ws.reduce((a, n) => a + n, 0)) / (words.length - 1);
          let wx = x0;
          words.forEach((w, k) => { fillRich(w, offs[k], wx, cy, 'left'); wx += ws[k] + gap; });
        } else fillRich(l.t, l.o ?? 0, f.align === 'left' ? x0 : f.align === 'right' ? x0 + iw : x0 + iw / 2, cy, f.align, l.e);
        ty += lh;
      }
    } else {
      const lines = b.mode === 'free' ? wrapText(b.text ?? '', maxW, textW) : [b.text ?? ''];
      const lh = f.size * f.lineHeight;
      const top = b.mode === 'free' ? b.y + b.h / 2 - (lines.length * lh) / 2 : b.y;
      lines.forEach((line, i) => fill(line, x, top + i * lh + lh / 2, f.align));
    }
    spaced(ctx, 0);
  }
  ctx.restore();
}

/** The design's background pattern over the plate's metal (the canvas twin of the CSS layers; see `canvasPattern`). */
function drawBackPattern(ctx: CanvasRenderingContext2D, r: Rect, p: ReturnType<typeof canvasPattern>, img: HTMLImageElement | null, dark: boolean) {
  if (p.kind === 'lines') {
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.2)';
    for (let x = r.x; x < r.x + r.w; x += 4) ctx.fillRect(x, r.y, 1, r.h);
  } else if (p.kind === 'holes') {
    // Two offset grids of dots, as the site's CSS (28 px cells on a 240 px card).
    const k = r.w / CANVAS_BACK_REF.w, cell = 28 * k;
    const dots = (first: number, rad: number, a: number) => {
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      for (let y = r.y + first; y < r.y + r.h + cell; y += cell) for (let x = r.x + first; x < r.x + r.w + cell; x += cell) { ctx.beginPath(); ctx.arc(x, y, rad * k, 0, Math.PI * 2); ctx.fill(); }
    };
    dots(cell / 2, 5, 0.28); dots(0, 4, 0.2);
  } else if (p.kind === 'cover' && img) {
    const k = Math.max(r.w / img.width, r.h / img.height);
    ctx.drawImage(img, r.x + (r.w - img.width * k) / 2, r.y + (r.h - img.height * k) / 2, img.width * k, img.height * k);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(r.x, r.y, r.w, r.h);
  } else if (p.kind === 'svg' && img) {
    ctx.save();
    ctx.globalCompositeOperation = p.blend;
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
    ctx.restore();
  }
}

/**
 * An edition's back as a card-shaped panel: the pack's design, drawn from the layout engine's nodes like the site's FlipCard and the overlay
 * do. The metal, the pattern and the edge follow the design's colours.
 */
async function drawBackCard(ctx: CanvasRenderingContext2D, r: Rect, spec: NonNullable<NonNullable<ShareSpec['plate']>['back']>, rarityEdge: string, font: string, t: ShareTheme) {
  const style = spec.style ?? DEFAULT_CARD_BACK;
  const ref = CANVAS_BACK_REF;
  let nodes = layoutBack(style, spec, { ...ref });
  await loadBackFonts(fontsNeeded(nodes));
  if (nodes.some(n => n.spec)) nodes = layoutBack(style, spec, { ...ref }); // fit, wrapping and small caps measure the loaded fonts
  const images = new Map<string, HTMLImageElement | null>();
  await Promise.all(nodes.filter(n => n.src).map(async n => { images.set(n.src!, await loadImage(n.src!)); }));
  const pattern = canvasPattern(style);
  const patternImg = pattern.kind === 'svg' || pattern.kind === 'cover' ? await loadImage(pattern.src) : null;
  const look = plateLook(style);
  const pl = look ? { ...t.plate, ...(look.stops ? { stops: look.stops, dark: !!look.dark } : {}), ...(look.ink ? { ink: look.ink } : {}) } : t.plate;
  const edge = look?.edge ?? rarityEdge;
  const radius = 20;
  ctx.save();
  ctx.shadowColor = edge; ctx.shadowBlur = 30;
  const metal = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  metal.addColorStop(0, pl.stops[0]); metal.addColorStop(0.36, pl.stops[1]); metal.addColorStop(0.62, pl.stops[2]); metal.addColorStop(1, pl.stops[3]);
  ctx.fillStyle = metal; roundRect(ctx, r.x, r.y, r.w, r.h, radius); ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, radius); ctx.clip();
  drawBackPattern(ctx, r, pattern, patternImg, pl.dark);
  const sheen = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  sheen.addColorStop(0, pl.dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.28)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = sheen; ctx.fillRect(r.x, r.y, r.w, r.h);
  // The design, in reference px scaled to the panel.
  const k = r.w / ref.w;
  ctx.translate(r.x, r.y); ctx.scale(k, k);
  for (const b of placeBack(nodes, ref)) {
    const numFont = b.kind === 'number' && b.mode === 'stack' ? nodes.find(n => n.id === b.id)?.vars['--num-font'] : undefined;
    drawBackBox(ctx, numFont ? { ...b, font: { ...b.font, family: numFont } } : b, font, images);
  }
  ctx.restore();
  ctx.strokeStyle = edge; ctx.lineWidth = 4; roundRect(ctx, r.x, r.y, r.w, r.h, radius); ctx.stroke();
}

/** A rounded rectangle with a separate radius for each corner [top-left, top-right, bottom-right, bottom-left]. */
function roundRectR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: [number, number, number, number]) {
  const [tl, tr, br, bl] = r;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y); ctx.arcTo(x + w, y, x + w, y + tr, tr || 0.0001);
  ctx.lineTo(x + w, y + h - br); ctx.arcTo(x + w, y + h, x + w - br, y + h, br || 0.0001);
  ctx.lineTo(x + bl, y + h); ctx.arcTo(x, y + h, x, y + h - bl, bl || 0.0001);
  ctx.lineTo(x, y + tl); ctx.arcTo(x, y, x + tl, y, tl || 0.0001);
  ctx.closePath();
}

/** The binder's cover: its colour and material, a dashed stitch line and a soft shadow, like the website's. */
function drawLeather(ctx: CanvasRenderingContext2D, r: Rect, b: BinderShare) {
  const c = b.cover;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
  ctx.fillStyle = c.b; roundRect(ctx, r.x, r.y, r.w, r.h, 18); ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, 18); ctx.clip();
  if (b.material === 'metal') {
    const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h * 0.45);
    [[0, c.c], [0.22, c.a], [0.38, c.b], [0.56, c.a], [0.78, c.c], [1, c.b]].forEach(([o, col]) => g.addColorStop(o as number, col as string));
    ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = r.x; x < r.x + r.w; x += 3) ctx.fillRect(x, r.y, 1, r.h);
  } else if (b.material === 'holo') {
    const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h * 0.3);
    [[0, c.c], [0.17, c.a], [0.34, '#ff7ab8'], [0.5, '#7ad7ff'], [0.66, '#a6ff9a'], [0.83, c.a], [1, c.c]].forEach(([o, col]) => g.addColorStop(o as number, col as string));
    ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
  } else {
    const g = ctx.createRadialGradient(r.x + r.w * 0.2, r.y, 10, r.x + r.w * 0.2, r.y, Math.max(r.w, r.h) * 1.15);
    g.addColorStop(0, c.a); g.addColorStop(0.55, c.b); g.addColorStop(1, c.c);
    ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
    if (b.material === 'cloth') {
      // A woven look: fine crossing diagonals.
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      for (let d = -r.h; d < r.w; d += 5) { ctx.beginPath(); ctx.moveTo(r.x + d, r.y + r.h); ctx.lineTo(r.x + d + r.h, r.y); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      for (let d = 0; d < r.w + r.h; d += 5) { ctx.beginPath(); ctx.moveTo(r.x + d, r.y + r.h); ctx.lineTo(r.x + d - r.h, r.y); ctx.stroke(); }
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.5; roundRect(ctx, r.x, r.y, r.w, r.h, 18); ctx.stroke();
  ctx.save();
  ctx.setLineDash([7, 6]); ctx.strokeStyle = 'rgba(255,214,150,0.35)'; ctx.lineWidth = 1.5;
  roundRect(ctx, r.x + 6, r.y + 6, r.w - 12, r.h - 12, 13); ctx.stroke();
  ctx.restore();
}

/** One pocket: the card in its rarity border (or the binder's look for a card they don't have yet). */
function drawPocket(ctx: CanvasRenderingContext2D, r: Rect, slot: BinderShareSlot | null, img: HTMLImageElement | null, b: BinderShare, k: number, font: string) {
  const dark = !b.page.light;
  const emptyFill = dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)';
  const emptyLine = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.1)';
  const radius = 8 * k;
  if (!slot || (!slot.owned && b.missing === 'blank')) {
    ctx.fillStyle = emptyFill; roundRect(ctx, r.x, r.y, r.w, r.h, radius); ctx.fill();
    ctx.save(); ctx.setLineDash([5 * k, 4 * k]); ctx.strokeStyle = emptyLine; ctx.lineWidth = Math.max(1, k); roundRect(ctx, r.x, r.y, r.w, r.h, radius); ctx.stroke(); ctx.restore();
    return;
  }
  if (!slot.owned) {
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'; roundRect(ctx, r.x, r.y, r.w, r.h, radius); ctx.fill();
    if (b.missing === 'ghost' && img) {
      ctx.save(); roundRect(ctx, r.x, r.y, r.w, r.h, radius); ctx.clip();
      ctx.globalAlpha = 0.14;
      if ('filter' in ctx) (ctx as CanvasRenderingContext2D & { filter: string }).filter = 'grayscale(1)';
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
      ctx.restore();
    }
    ctx.save(); ctx.setLineDash([5 * k, 4 * k]); ctx.strokeStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.18)'; ctx.lineWidth = Math.max(1.2, 1.5 * k); roundRect(ctx, r.x, r.y, r.w, r.h, radius); ctx.stroke(); ctx.restore();
    ctx.textAlign = 'center'; ctx.fillStyle = b.page.muted;
    const mid = r.y + r.h / 2;
    ctx.font = `800 ${18 * k}px ${font}`; ctx.fillText(`#${slot.number}`, r.x + r.w / 2, mid + (b.missing === 'name' ? 0 : 6 * k), r.w - 8 * k);
    if (b.missing === 'name') { ctx.font = `600 ${10 * k}px ${font}`; ctx.fillText(slot.name, r.x + r.w / 2, mid + 16 * k, r.w - 8 * k); }
    if (slot.label) { ctx.font = `600 ${10 * k}px ${font}`; ctx.fillText(slot.label, r.x + r.w / 2, mid + (b.missing === 'name' ? 29 : 18) * k, r.w - 8 * k); }
    ctx.textAlign = 'left';
    return;
  }
  const hex = slot.hex ?? '#facc15';
  const frame = b.pocket === 'frame';
  const rad = frame ? 10 * k : radius;
  // The card, with a soft shadow that follows its own (transparent cornered) outline.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12 * k; ctx.shadowOffsetY = 5 * k;
  if (img) ctx.drawImage(img, r.x, r.y, r.w, r.h);
  else { ctx.fillStyle = '#1f2937'; roundRect(ctx, r.x, r.y, r.w, r.h, rad); ctx.fill(); }
  ctx.restore();
  if (!img) { ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center'; ctx.font = `700 ${12 * k}px ${font}`; ctx.fillText(slot.name, r.x + r.w / 2, r.y + r.h / 2, r.w - 8 * k); ctx.textAlign = 'left'; }
  if (b.pocket !== 'flat') {
    ctx.strokeStyle = hex; ctx.lineWidth = (frame ? 4 : 2) * k;
    const inset = ctx.lineWidth / 2;
    roundRect(ctx, r.x + inset, r.y + inset, r.w - 2 * inset, r.h - 2 * inset, rad); ctx.stroke();
  }
  if (b.pocket === 'sleeve') {
    ctx.save(); roundRect(ctx, r.x, r.y, r.w, r.h, rad); ctx.clip();
    const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.38, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.1)');
    ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = Math.max(1, k); roundRect(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad); ctx.stroke();
  }
  if (b.badges) {
    const pill = (text: string, x: number, y: number, size: number, fill: string, line: string, ink: string, rightAlign = false) => {
      ctx.font = `800 ${size}px ${font}`;
      const w = ctx.measureText(text).width + size * 1.1, h = size * 1.45;
      const px = rightAlign ? x - w : x;
      ctx.fillStyle = fill; roundRect(ctx, px, y, w, h, h / 2); ctx.fill();
      ctx.strokeStyle = line; ctx.lineWidth = Math.max(1, k * 0.9); ctx.stroke();
      ctx.fillStyle = ink; ctx.fillText(text, px + size * 0.55, y + size * 1.1);
    };
    if (slot.count > 1) pill(`×${slot.count}`, r.x + 4 * k, r.y + 4 * k, 10 * k, 'rgba(7,11,29,0.88)', 'rgba(234,179,8,0.5)', '#fde047');
    if (slot.tag) pill(slot.tag, r.x + r.w - 4 * k, r.y + r.h - 4 * k - 9 * k * 1.45, 9 * k, 'rgba(7,11,29,0.88)', 'rgba(232,121,249,0.5)', '#f5d0fe', true);
  }
}

/** The stats card: rank and score, six figure tiles and a strip of their most valuable prints (spec.cards). */
async function drawStatsCard(ctx: CanvasRenderingContext2D, spec: ShareSpec, H: number, font: string, t: ShareTheme, preview: boolean) {
  const sc = spec.statsCard!;
  const L = statsLayout(H, Math.min(3, spec.cards.length));
  const accent = sc.accent ?? t.chipText;
  const imgs = await Promise.all(spec.cards.slice(0, L.thumbs.length).map(c => loadImage(preview ? c.thumb ?? c.src : c.src)));

  // Rank and score, big.
  const hero = L.hero, half = (hero.w - 24) / 2;
  const heroes: [string, string, string][] = [['RANK', sc.rank, accent], ['POINTS', sc.score, t.title]];
  heroes.forEach(([label, value, colour], i) => {
    const x = hero.x + i * (half + 24);
    ctx.fillStyle = t.tile; roundRect(ctx, x, hero.y, half, hero.h, 26); ctx.fill();
    ctx.strokeStyle = i === 0 ? accent : t.chipBorder; ctx.lineWidth = i === 0 ? 4 : 2; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = colour; ctx.font = `800 110px ${font}`; ctx.fillText(value, x + half / 2, hero.y + hero.h / 2 + 30, half - 40);
    ctx.fillStyle = t.subtitle; ctx.font = `700 24px ${font}`; spaced(ctx, 3); ctx.fillText(label, x + half / 2, hero.y + hero.h - 28); spaced(ctx, 0);
    ctx.textAlign = 'left';
  });

  // Six figures, two columns of three.
  sc.figures.slice(0, 6).forEach((f, i) => {
    const r = L.tiles[i];
    ctx.fillStyle = t.tile; roundRect(ctx, r.x, r.y, r.w, r.h, 20); ctx.fill();
    ctx.strokeStyle = t.chipBorder; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = t.subtitle; ctx.font = `700 21px ${font}`; spaced(ctx, 2); ctx.fillText(f.label.toUpperCase(), r.x + 26, r.y + 40, r.w - 52); spaced(ctx, 0);
    ctx.fillStyle = t.chipText; ctx.font = `800 48px ${font}`; ctx.fillText(f.value, r.x + 26, r.y + 92, r.w - 52);
    if (f.progress !== undefined) {
      const bw = r.w - 52, by = r.y + r.h - 24;
      ctx.fillStyle = t.chipBg; roundRect(ctx, r.x + 26, by, bw, 10, 5); ctx.fill();
      if (f.progress > 0) { ctx.fillStyle = accent; roundRect(ctx, r.x + 26, by, Math.max(10, bw * Math.min(1, f.progress)), 10, 5); ctx.fill(); }
    } else if (f.sub) {
      ctx.fillStyle = t.subtitle; ctx.font = `600 22px ${font}`; ctx.fillText(f.sub, r.x + 26, r.y + r.h - 18, r.w - 52);
    }
  });

  // Their most valuable prints, small.
  if (L.thumbs.length > 0 && L.thumbs[0].h > 60) {
    ctx.textAlign = 'center';
    ctx.fillStyle = t.subtitle; ctx.font = `700 22px ${font}`; spaced(ctx, 3); ctx.fillText('MOST VALUABLE EDITIONS', L.strip.x + L.strip.w / 2, L.stripLabelY); spaced(ctx, 0);
    ctx.textAlign = 'left';
    L.thumbs.forEach((r, i) => {
      const card = spec.cards[i], img = imgs[i], hex = card?.hex ?? '#facc15';
      ctx.save(); ctx.shadowColor = hex; ctx.shadowBlur = 22;
      if (img) ctx.drawImage(img, r.x, r.y, r.w, r.h);
      else { ctx.fillStyle = t.tile; roundRect(ctx, r.x, r.y, r.w, r.h, 12); ctx.fill(); }
      ctx.restore();
      if (card?.tag) {
        ctx.font = `800 20px ${font}`;
        const tw = ctx.measureText(card.tag).width + 18;
        ctx.fillStyle = 'rgba(7,11,29,0.9)'; roundRect(ctx, r.x + r.w - tw - 8, r.y + 10, tw, 32, 16); ctx.fill();
        ctx.fillStyle = '#fde047'; ctx.fillText(card.tag, r.x + r.w - tw + 1, r.y + 33);
      }
    });
  }
}

/** Draws the binder pages (cover frame, page paper, headings and every pocket) where the card grid would normally go. */
async function drawBinder(ctx: CanvasRenderingContext2D, b: BinderShare, H: number, font: string, preview: boolean) {
  const L = binderLayout(b, H);
  drawLeather(ctx, L.leather, b);
  const two = L.pages.length === 2;

  // Load every image the pages need (full art for the saved image, thumbnails for the live preview).
  const jobs = L.pages.map((_, pi) => Promise.all(b.pages[pi].slots.map(s => {
    if (!s || (!s.owned && b.missing !== 'ghost')) return Promise.resolve(null);
    return loadImage(preview ? s.thumb ?? s.src : s.src);
  })));
  const imgs = await Promise.all(jobs);

  L.pages.forEach((pg, pi) => {
    const r = pg.rect;
    const radii: [number, number, number, number] = two ? (pi === 0 ? [10, 0, 0, 10] : [0, 10, 10, 0]) : [10, 10, 10, 10];
    ctx.save();
    roundRectR(ctx, r.x, r.y, r.w, r.h, radii); ctx.clip();
    const paper = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    paper.addColorStop(0, b.page.a); paper.addColorStop(1, b.page.b);
    ctx.fillStyle = paper; ctx.fillRect(r.x, r.y, r.w, r.h);
    if (two) {
      // Shade towards the spine, so the two pages read as an open book.
      const spineX = pi === 0 ? r.x + r.w : r.x;
      const g = ctx.createLinearGradient(spineX, 0, spineX + (pi === 0 ? -26 : 26), 0);
      g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; roundRectR(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, radii); ctx.stroke();

    const title = b.pages[pi].title;
    if (title) {
      const fs = Math.min(16, Math.max(11, 12 * L.k));
      ctx.font = `800 ${fs}px ${font}`; ctx.fillStyle = b.page.ink; ctx.textAlign = 'left'; spaced(ctx, 1.6);
      ctx.fillText(title.toUpperCase(), pg.head.x, pg.head.y + fs, pg.head.w);
      spaced(ctx, 0);
    }
    pg.pockets.forEach((pr, si) => drawPocket(ctx, pr, b.pages[pi].slots[si] ?? null, imgs[pi][si] ?? null, b, L.k, font));
  });

  if (two) {
    // The three binder rings down the middle.
    const L0 = L.leather; const cx = L.pages[1].rect.x;
    [0.22, 0.5, 0.78].forEach(f => {
      const cy = L0.y + L0.h * f;
      const g = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 12);
      g.addColorStop(0, '#f1f1f5'); g.addColorStop(0.6, '#8a8a96'); g.addColorStop(1, '#4b4b55');
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }
}

/** Draws the image on a canvas. A card whose art can't be loaded (blocked or offline) is drawn as a plain tile, never skipped. */
export async function renderShare(spec: ShareSpec, opts?: { preview?: boolean }): Promise<HTMLCanvasElement> {
  const H = formatHeight(spec.format);
  const t = getShareTheme(spec.theme);
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, t.bg[0]); bg.addColorStop(1, t.bg[1]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, SHARE_W, H);
  const glow = ctx.createRadialGradient(SHARE_W / 2, HEADER_H, 40, SHARE_W / 2, HEADER_H, 760);
  glow.addColorStop(0, t.glow); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, SHARE_W, H);
  const bar = ctx.createLinearGradient(0, 0, SHARE_W, 0);
  t.bar.forEach((c, i, a) => bar.addColorStop(a.length === 1 ? 0 : i / (a.length - 1), c));
  ctx.fillStyle = bar; ctx.fillRect(0, 0, SHARE_W, 10);

  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = t.title; ctx.font = `800 64px ${font}`;
  ctx.fillText(spec.title.length > 26 ? `${spec.title.slice(0, 25)}…` : spec.title, 70, 108, SHARE_W - 140);
  if (spec.subtitle) { ctx.fillStyle = t.subtitle; ctx.font = `600 30px ${font}`; ctx.fillText(spec.subtitle, 70, 158, SHARE_W - 140); }
  if (spec.stats?.length) {
    ctx.font = `700 30px ${font}`;
    let x = 70;
    for (const s of spec.stats) {
      const w = ctx.measureText(s).width + 36;
      ctx.fillStyle = t.chipBg; roundRect(ctx, x, 182, w, 46, 23); ctx.fill();
      ctx.strokeStyle = t.chipBorder; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = t.chipText; ctx.fillText(s, x + 18, 215);
      x += w + 14;
    }
  }

  if (spec.bigStats?.length) {
    const gap = 24, n = spec.bigStats.length;
    const w = (SHARE_W - 140 - gap * (n - 1)) / n;
    spec.bigStats.forEach((s, i) => {
      const x = 70 + i * (w + gap), y = HEADER_H;
      ctx.fillStyle = t.tile; roundRect(ctx, x, y, w, BIG_STATS_H, 22); ctx.fill();
      ctx.strokeStyle = t.chipBorder; ctx.lineWidth = 2; ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = t.chipText; ctx.font = `800 58px ${font}`; ctx.fillText(s.value, x + w / 2, y + 84, w - 24);
      ctx.fillStyle = t.subtitle; ctx.font = `700 21px ${font}`; spaced(ctx, 2); ctx.fillText(s.label.toUpperCase(), x + w / 2, y + 122, w - 24); spaced(ctx, 0);
      ctx.textAlign = 'left';
    });
  }

  if (spec.binder) await drawBinder(ctx, spec.binder, H, font, !!opts?.preview);
  if (spec.statsCard) await drawStatsCard(ctx, spec, H, font, t, !!opts?.preview);
  const n = spec.binder || spec.statsCard ? 0 : spec.cards.length;
  const designed = spec.plate?.back;
  const area = designed ? cardArea(H) : spec.plate ? cardAreaWithPlate(H) : spec.bigStats?.length ? cardAreaWithStats(H) : cardArea(H);
  // A tall story fits two columns of 5-6 cards bigger than three thin ones.
  const cols = H > 1500 && n >= 5 && n <= 6 ? 2 : undefined;
  const allRects = layoutCards(n + (designed ? 1 : 0), area, 28, cols);
  const rects = allRects.slice(0, n);
  const imgs = await Promise.all(spec.cards.slice(0, rects.length).map(c => loadImage(opts?.preview ? c.thumb ?? c.src : c.src)));
  rects.forEach((r, i) => {
    const card = spec.cards[i];
    const img = imgs[i];
    const hex = card.hex ?? '#facc15';
    if (img) {
      // The art has transparent rounded corners: draw it as it is (no box behind or border around it) and let the glow follow
      // its silhouette, since a canvas shadow is cast by the opaque pixels only.
      ctx.save();
      ctx.shadowColor = hex; ctx.shadowBlur = 30;
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
      ctx.restore();
    } else {
      ctx.save();
      ctx.shadowColor = hex; ctx.shadowBlur = 30;
      ctx.fillStyle = t.tile; roundRect(ctx, r.x, r.y, r.w, r.h, 18); ctx.fill();
      ctx.restore();
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, 18); ctx.clip();
      ctx.fillStyle = '#1f2937'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center'; ctx.font = `700 ${Math.max(18, r.w / 9)}px ${font}`; ctx.fillText(card.name, r.x + r.w / 2, r.y + r.h / 2, r.w - 20); ctx.textAlign = 'left';
      ctx.restore();
      ctx.strokeStyle = hex; ctx.lineWidth = 4; roundRect(ctx, r.x, r.y, r.w, r.h, 18); ctx.stroke();
    }
    if (card.tag) {
      const fs = Math.max(20, Math.min(34, r.w / 7));
      ctx.font = `800 ${fs}px ${font}`;
      const tw = ctx.measureText(card.tag).width + 24;
      // Top right, inset a little so it sits on the card rather than the rounded corner.
      const tx = r.x + r.w - tw - 18, ty = r.y + 20;
      ctx.fillStyle = 'rgba(7,11,29,0.9)'; roundRect(ctx, tx, ty, tw, fs + 18, (fs + 18) / 2); ctx.fill();
      ctx.fillStyle = '#fde047'; ctx.fillText(card.tag, tx + 12, ty + fs + 3);
    }
  });

  if (spec.plate && designed && allRects[n]) await drawBackCard(ctx, allRects[n], designed, spec.cards[0]?.hex ?? '#facc15', font, t);
  else if (spec.plate) drawPlate(ctx, spec.plate, spec.cards[0]?.hex ?? '#facc15', font, t, H);

  ctx.fillStyle = t.footer; ctx.font = `600 28px ${font}`; ctx.textAlign = 'center';
  ctx.fillText(spec.footer, SHARE_W / 2, H - 40, SHARE_W - 140);
  return canvas;
}

export type ExportResult = 'shared' | 'downloaded' | 'cancelled';

/** Builds the image, then hands it to the phone's share sheet (with the link and a line of text) or downloads it. */
export async function exportShare(spec: ShareSpec, filename: string, extra?: { text?: string; url?: string; download?: boolean }): Promise<ExportResult> {
  const canvas = await renderShare(spec);
  const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('no image');
  const file = new File([blob], filename, { type: 'image/png' });
  if (!extra?.download && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: spec.title, ...(extra?.text ? { text: extra.text } : {}), ...(extra?.url && navigator.canShare?.({ files: [file], url: extra.url }) ? { url: extra.url } : {}) });
      return 'shared';
    } catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

/** A button that builds the image in the browser, then shares it (phones) or downloads it. */
export function ShareImageButton({ spec, filename, label = 'Share image', className }: { spec: ShareSpec; filename: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');

  async function go() {
    setState('working');
    try { await exportShare(spec, filename); setState('idle'); } catch { setState('error'); }
  }

  return (
    <button type="button" onClick={go} disabled={state === 'working'} className={className ?? 'inline-flex items-center gap-1.5 text-xs font-bold text-gray-200 bg-white/6 border border-white/10 hover:bg-white/10 rounded-full px-3 py-1.5 transition-colors disabled:opacity-60'}>
      <Icon name="image" />{state === 'working' ? 'Making image…' : state === 'error' ? 'Could not make the image, retry' : label}
    </button>
  );
}
