'use client';
import { useState } from 'react';
import { Icon } from './Icon';
import {
  SHARE_W, HEADER_H, BIG_STATS_H, cardArea, cardAreaWithPlate, cardAreaWithStats, plateRect, layoutCards, formatHeight, getShareTheme, binderLayout,
  type BinderShare, type BinderShareSlot, type Rect, type ShareSpec, type ShareTheme,
} from '@/lib/share-image';
import { qrModules } from '@/lib/qr';

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
function drawPlate(ctx: CanvasRenderingContext2D, p: NonNullable<ShareSpec['plate']>, edge: string, font: string, t: ShareTheme, h: number) {
  const r = plateRect(h);
  const pl = t.plate;
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
  const qr = p.qrUrl ? qrModules(p.qrUrl) : null;
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

  engrave('THE CHEESY TCG  ·  PRINT', left, r.y + 46, 16, 800, pl.ink, textW, font, 3);
  // A fine rule under the label.
  ctx.fillStyle = pl.lo; ctx.fillRect(left, r.y + 58, textW, 1);
  ctx.fillStyle = pl.hi; ctx.fillRect(left, r.y + 59, textW, 1);

  // The number: small "No." and the digits in a tabular face, much quieter than before.
  engrave('No.', left, r.y + 110, 20, 800, pl.ink, 60, font, 2);
  const nx = left + 50;
  const digits = p.number.replace(/^#/, '');
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
  engrave(p.edition, left, r.y + 146, 23, 700, pl.ink, textW);
  const bits = [p.date, ...(p.lines ?? [])].filter(Boolean) as string[];
  if (bits.length) engrave(bits.slice(0, 2).join('   ·   '), left, r.y + 176, 17, 700, pl.ink, textW, font, 1);

  if (qr) {
    const q = r.x + r.w - 62 - qrSize, qy = r.y + (r.h - qrSize) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.94)'; roundRect(ctx, q - 8, qy - 8, qrSize + 16, qrSize + 16, 10); ctx.fill();
    const cell = qrSize / (qr.size + 2);
    ctx.fillStyle = '#1f1f24';
    for (let row = 0; row < qr.size; row++) for (let col = 0; col < qr.size; col++) if (qr.dark(row, col)) ctx.fillRect(q + (col + 1) * cell, qy + (row + 1) * cell, Math.ceil(cell), Math.ceil(cell));
  }
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
  const n = spec.binder ? 0 : spec.cards.length;
  const area = spec.plate ? cardAreaWithPlate(H) : spec.bigStats?.length ? cardAreaWithStats(H) : cardArea(H);
  // A tall story fits two columns of 5-6 cards bigger than three thin ones.
  const cols = H > 1500 && n >= 5 && n <= 6 ? 2 : undefined;
  const rects = layoutCards(n, area, 28, cols);
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

  if (spec.plate) drawPlate(ctx, spec.plate, spec.cards[0]?.hex ?? '#facc15', font, t, H);

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
    <button type="button" onClick={go} disabled={state === 'working'} className={className ?? 'inline-flex items-center gap-1.5 text-xs font-bold text-gray-200 bg-white/[0.06] border border-white/10 hover:bg-white/10 rounded-full px-3 py-1.5 transition-colors disabled:opacity-60'}>
      <Icon name="image" />{state === 'working' ? 'Making image…' : state === 'error' ? 'Could not make the image, retry' : label}
    </button>
  );
}
