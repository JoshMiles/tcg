'use client';
import { useEffect, useRef, type ReactNode } from 'react';

/** A horizontally scrolling tab strip (links with `aria-current="page"` on the active one) that starts scrolled to the active tab, so on a phone it is never hidden off the edge. */
export function TabStrip({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current; const tab = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && tab) nav.scrollLeft = tab.offsetLeft - (nav.clientWidth - tab.offsetWidth) / 2;
  });
  return <nav ref={ref} aria-label={label} className="no-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-800 -mx-1 px-1">{children}</nav>;
}
