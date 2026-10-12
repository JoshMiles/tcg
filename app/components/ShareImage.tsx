'use client';
import { useState } from 'react';
import { Icon } from './Icon';
import { SHARE_H, SHARE_W, HEADER_H, cardArea, layoutCards, type ShareSpec } from '@/lib/share-image';

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

  const rects = layoutCards(spec.cards.length, cardArea());
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
      ctx.fillStyle = 'rgba(7,11,29,0.88)'; roundRect(ctx, r.x + 12, r.y + r.h - fs - 30, tw, fs + 18, (fs + 18) / 2); ctx.fill();
      ctx.fillStyle = '#fde047'; ctx.fillText(card.tag, r.x + 24, r.y + r.h - 20);
    }
    ctx.restore();
    ctx.strokeStyle = card.hex ?? '#facc15'; ctx.lineWidth = 4; roundRect(ctx, r.x, r.y, r.w, r.h, 18); ctx.stroke();
  });

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
