'use client';
import { useState } from 'react';
import { Icon } from './Icon';
import {
  SHARE_W, HEADER_H, BIG_STATS_H, cardArea, cardAreaWithPlate, cardAreaWithStats, plateRect, layoutCards, formatHeight, getShareTheme,
  type ShareSpec, type ShareTheme,
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

  engrave('THE CHEESY TCG  ·  UNIQUE COPY', left, r.y + 46, 16, 800, pl.ink, textW, font, 3);
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

  const n = spec.cards.length;
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
