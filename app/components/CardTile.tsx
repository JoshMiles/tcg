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
  still,
  alt,
  className,
  style,
  title,
  label,
  onActivate,
  eager,
  children,
}: {
  imageUrl: string;
  /** A chosen still frame (card.stillUrl); without it the thumbnail (the first frame) is the still. */
  still?: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  /** Accessible name of the tile when it should not include the overlay text. */
  label?: string;
  /** Makes the tile a button; called with the tile element on click / Enter / Space. */
  onActivate?: (el: HTMLElement) => void;
  /** Above-the-fold tile: load at once, not lazily (it is often the page's LCP image). */
  eager?: boolean;
  children?: ReactNode;
}) {
  const base = cardThumbUrl(imageUrl);
  const animates = base !== imageUrl;
  const thumb = still || base;
  const [hovered, setHovered] = useState(false);
  const [ready, setReady] = useState(false);

  return (
    <div
      className={className}
      style={{ ...style, ['--art-mask' as string]: animates ? `url("${thumb}")` : 'none' } as CSSProperties}
      title={title}
      aria-label={label}
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
      <img src={thumb} alt={alt} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} className="w-full h-full object-cover" />
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
