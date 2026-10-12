'use client';
import { useState } from 'react';
import { Icon } from './Icon';
import { SHARE_H, SHARE_W, HEADER_H, cardArea, cardAreaWithPlate, plateRect, layoutCards, type ShareSpec } from '@/lib/share-image';
import { qrModules } from '@/lib/qr';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** The engraved steel plate under a single copy's card. */
function drawPlate(ctx: CanvasRenderingContext2D, p: NonNullable<ShareSpec['plate']>, edge: string, font: string) {
  const r = plateRect();
  ctx.save();
  ctx.shadowColor = edge; ctx.shadowBlur = 26;
  const steel = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  steel.addColorStop(0, '#a9a9b3'); steel.addColorStop(0.36, '#dcdce3'); steel.addColorStop(0.62, '#9a9aa5'); steel.addColorStop(1, '#c4c4cd');
  ctx.fillStyle = steel; roundRect(ctx, r.x, r.y, r.w, r.h, 22); ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, 22); ctx.clip();
  // Brushed lines.
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (let x = r.x; x < r.x + r.w; x += 4) ctx.fillRect(x, r.y, 1, r.h);
  ctx.restore();
  ctx.strokeStyle = edge; ctx.lineWidth = 5; roundRect(ctx, r.x, r.y, r.w, r.h, 22); ctx.stroke();

  const pad = 34;
  const qr = p.qrUrl ? qrModules(p.qrUrl) : null;
  const qrSize = 170;
  const textW = r.w - pad * 2 - (qr ? qrSize + 30 : 0);

  // Engraved lettering: a light edge below and a dark edge above, so it looks cut into the metal.
  const engrave = (text: string, x: number, y: number, size: number, weight: number, fill: string, maxW: number) => {
    ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(text, x, y + 2, maxW);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillText(text, x, y - 1, maxW);
    ctx.fillStyle = fill; ctx.fillText(text, x, y, maxW);
  };
  engrave('THE CHEESY TCG  ·  UNIQUE COPY', r.x + pad, r.y + 46, 22, 800, 'rgba(24,24,32,0.75)', textW);
  if (p.gold) {
    const g = ctx.createLinearGradient(0, r.y + 56, 0, r.y + 124);
    g.addColorStop(0, '#e0a81c'); g.addColorStop(0.45, '#f7d56b'); g.addColorStop(1, '#8a5a00');
    ctx.font = `800 82px ${font}`; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(p.number, r.x + pad, r.y + 123, textW);
    ctx.fillStyle = g; ctx.fillText(p.number, r.x + pad, r.y + 120, textW);
  } else {
    engrave(p.number, r.x + pad, r.y + 120, 82, 800, 'rgba(30,30,38,0.8)', textW);
  }
  engrave(p.edition, r.x + pad, r.y + 162, 30, 800, 'rgba(18,18,26,0.82)', textW);
  const rest = [p.date, ...(p.lines ?? [])].filter(Boolean) as string[];
  rest.slice(0, 2).forEach((line, i) => engrave(line, r.x + pad, r.y + 197 + i * 30, i === 0 ? 24 : 22, i === 0 ? 800 : 700, 'rgba(18,18,26,0.78)', textW));

  if (qr) {
    const q = r.x + r.w - pad - qrSize, qy = r.y + (r.h - qrSize) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; roundRect(ctx, q - 8, qy - 8, qrSize + 16, qrSize + 16, 10); ctx.fill();
    const cell = qrSize / (qr.size + 2);
    ctx.fillStyle = '#1f1f24';
    for (let row = 0; row < qr.size; row++) for (let col = 0; col < qr.size; col++) if (qr.dark(row, col)) ctx.fillRect(q + (col + 1) * cell, qy + (row + 1) * cell, Math.ceil(cell), Math.ceil(cell));
  }
}

/** Draws the image on a canvas. A card whose art can't be loaded (blocked or offline) is drawn as a plain tile, never skipped. */
export async function renderShare(spec: ShareSpec): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_W; canvas.height = SHARE_H;
  const ctx = canvas.getContext('2d')!;
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';

  const bg = ctx.createLinearGradient(0, 0, 0, SHARE_H);
  bg.addColorStop(0, '#111936'); bg.addColorStop(1, '#070b1d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  const glow = ctx.createRadialGradient(SHARE_W / 2, HEADER_H, 40, SHARE_W / 2, HEADER_H, 760);
  glow.addColorStop(0, 'rgba(250,204,21,0.16)'); glow.addColorStop(1, 'rgba(250,204,21,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  const bar = ctx.createLinearGradient(0, 0, SHARE_W, 0);
  ['#facc15', '#fb7185', '#c084fc', '#38bdf8', '#34d399'].forEach((c, i, a) => bar.addColorStop(i / (a.length - 1), c));
  ctx.fillStyle = bar; ctx.fillRect(0, 0, SHARE_W, 10);

  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff'; ctx.font = `800 64px ${font}`;
  ctx.fillText(spec.title.length > 26 ? `${spec.title.slice(0, 25)}…` : spec.title, 70, 108, SHARE_W - 140);
  if (spec.subtitle) { ctx.fillStyle = '#9ca3af'; ctx.font = `600 30px ${font}`; ctx.fillText(spec.subtitle, 70, 158, SHARE_W - 140); }
  if (spec.stats?.length) {
    ctx.font = `700 30px ${font}`;
    let x = 70;
    for (const s of spec.stats) {
      const w = ctx.measureText(s).width + 36;
      ctx.fillStyle = 'rgba(250,204,21,0.12)'; roundRect(ctx, x, 182, w, 46, 23); ctx.fill();
      ctx.strokeStyle = 'rgba(250,204,21,0.45)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fde047'; ctx.fillText(s, x + 18, 215);
      x += w + 14;
    }
  }

  const rects = layoutCards(spec.cards.length, spec.plate ? cardAreaWithPlate() : cardArea());
  const imgs = await Promise.all(spec.cards.slice(0, rects.length).map(c => loadImage(c.src)));
  rects.forEach((r, i) => {
    const card = spec.cards[i];
    ctx.save();
    ctx.shadowColor = card.hex ?? '#facc15'; ctx.shadowBlur = 30;
    ctx.fillStyle = '#0b1020'; roundRect(ctx, r.x, r.y, r.w, r.h, 18); ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 18); ctx.clip();
    const img = imgs[i];
    if (img) ctx.drawImage(img, r.x, r.y, r.w, r.h);
    else { ctx.fillStyle = '#1f2937'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center'; ctx.font = `700 ${Math.max(18, r.w / 9)}px ${font}`; ctx.fillText(card.name, r.x + r.w / 2, r.y + r.h / 2, r.w - 20); ctx.textAlign = 'left'; }
    if (card.tag) {
      const fs = Math.max(20, Math.min(34, r.w / 7));
      ctx.font = `800 ${fs}px ${font}`;
      const tw = ctx.measureText(card.tag).width + 24;
      // Top right: the bottom of the art carries the card's own name plate.
      ctx.fillStyle = 'rgba(7,11,29,0.9)'; roundRect(ctx, r.x + r.w - tw - 12, r.y + 12, tw, fs + 18, (fs + 18) / 2); ctx.fill();
      ctx.fillStyle = '#fde047'; ctx.fillText(card.tag, r.x + r.w - tw, r.y + 12 + fs + 3);
    }
    ctx.restore();
    ctx.strokeStyle = card.hex ?? '#facc15'; ctx.lineWidth = 4; roundRect(ctx, r.x, r.y, r.w, r.h, 18); ctx.stroke();
  });

  if (spec.plate) drawPlate(ctx, spec.plate, spec.cards[0]?.hex ?? '#facc15', font);

  ctx.fillStyle = '#9ca3af'; ctx.font = `600 28px ${font}`; ctx.textAlign = 'center';
  ctx.fillText(spec.footer, SHARE_W / 2, SHARE_H - 40, SHARE_W - 140);
  return canvas;
}

/** A button that builds the image in the browser, then shares it (phones) or downloads it. */
export function ShareImageButton({ spec, filename, label = 'Share image' }: { spec: ShareSpec; filename: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');

  async function go() {
    setState('working');
    try {
      const canvas = await renderShare(spec);
      const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('no image');
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: spec.title }); setState('idle'); return; } catch (e) { if ((e as Error).name === 'AbortError') { setState('idle'); return; } }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setState('idle');
    } catch {
      setState('error');
    }
  }

  return (
    <button type="button" onClick={go} disabled={state === 'working'} className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-200 bg-white/[0.06] border border-white/10 hover:bg-white/10 rounded-full px-3 py-1.5 transition-colors disabled:opacity-60">
      <Icon name="image" />{state === 'working' ? 'Making image…' : state === 'error' ? 'Could not make the image, retry' : label}
    </button>
  );
}
