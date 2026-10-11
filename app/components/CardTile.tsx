'use client';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { cardThumbUrl } from '@/lib/card-art';

/**
 * Card frame that shows a small static thumbnail and swaps in the full animated image only
 * while hovered. The animated file (1–4MB) is not requested until the first hover; the
 * thumbnail stays underneath until it has loaded, so there's no flicker.
 * `children` are overlays (badges, labels) rendered above the art.
 */
export function CardTile({
  imageUrl,
  alt,
  className,
  style,
  title,
  onActivate,
  children,
}: {
  imageUrl: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  /** Makes the tile a button; called with the tile element on click / Enter / Space. */
  onActivate?: (el: HTMLElement) => void;
  children?: ReactNode;
}) {
  const thumb = cardThumbUrl(imageUrl);
  const animates = thumb !== imageUrl;
  const [hovered, setHovered] = useState(false);
  const [ready, setReady] = useState(false);

  return (
    <div
      className={className}
      style={style}
      title={title}
      {...(onActivate ? {
        role: 'button',
        tabIndex: 0,
        onClick: (e: React.MouseEvent<HTMLElement>) => onActivate(e.currentTarget),
        onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(e.currentTarget); }
        },
      } : {})}
      onMouseEnter={() => animates && setHovered(true)}
      onMouseLeave={() => { setHovered(false); setReady(false); }}
    >
      <img src={thumb} alt={alt} loading="lazy" className="w-full h-full object-cover" />
      {hovered && (
        <img
          src={imageUrl}
          alt=""
          aria-hidden
          onLoad={() => setReady(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${ready ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {children}
    </div>
  );
}
