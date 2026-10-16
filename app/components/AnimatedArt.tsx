'use client';
import { useEffect, useState } from 'react';
import { cardThumbUrl } from '@/lib/card-art';

/**
 * Card art for the ceremonies: the static thumbnail straight away, with the animated image (the card's GIF / animated WebP) fading in
 * over it once it has loaded. The parent must be positioned and clip its children (the overlay fills it). Skipped when the viewer prefers
 * reduced motion, or when the art has no separate thumbnail (then it is already the only image).
 */
export function AnimatedArt({ url, still, alt, animate = true }: { url: string; still?: string; alt: string; animate?: boolean }) {
  const base = cardThumbUrl(url);
  const thumb = still || base;
  const [ready, setReady] = useState(false);
  const [motionOk, setMotionOk] = useState(false);
  useEffect(() => {
    try { setMotionOk(!window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { setMotionOk(true); }
  }, []);
  return (
    <>
      <img src={thumb} alt={alt} />
      {animate && motionOk && base !== url && (
        <img src={url} alt="" aria-hidden onLoad={() => setReady(true)} className={`art-anim ${ready ? 'art-anim-on' : ''}`} />
      )}
    </>
  );
}
