'use client';
import { useLinkStatus } from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';

/** A tab link's contents; pulses while its page loads, since a same-page `?tab=` change shows no `loading.tsx` skeleton. Must sit inside the `<Link>`. */
export function TabFace({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={`flex items-center gap-1.5${pending ? ' text-yellow-300 animate-pulse' : ''}`}>{children}</span>;
}

/** A horizontally scrolling tab strip (links with `aria-current="page"` on the active one) that starts scrolled to the active tab, so on a phone it is never hidden off the edge. */
export function TabStrip({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current; const tab = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && tab) nav.scrollLeft = tab.offsetLeft - (nav.clientWidth - tab.offsetWidth) / 2;
  });
  return <nav ref={ref} aria-label={label} className="no-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-800 -mx-1 px-1">{children}</nav>;
}
