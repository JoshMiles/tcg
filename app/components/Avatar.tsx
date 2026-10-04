'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Round avatar: shows the Twitch profile picture when we have one, otherwise (or if the image
 * fails to load) the user's initial on the theme gradient. Size/typography come from `className`.
 */
export function Avatar({ src, name, className = 'w-8 h-8 text-xs' }: { src?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // The server-rendered <img> can fail before React hydrates, so onError never fires for it.
  // On mount, check whether it already finished loading with no pixels.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (src && !failed) {
    return (
      <img
        ref={imgRef}
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${className} rounded-full object-cover bg-gray-800 shrink-0`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`${className} rounded-full bg-gradient-to-br from-poke-blue to-poke-blue-light flex items-center justify-center font-extrabold text-white shrink-0 uppercase`}
    >
      {name[0]}
    </div>
  );
}
