'use client';
import { useEffect } from 'react';

/**
 * On a page made of collapsible questions (the FAQ), a link like /faq#captcha should land on that question OPEN and in view. Browsers
 * scroll to the element but leave a closed <details> shut. This opens the question the address points at (and any question it sits
 * inside) on load and whenever the hash changes, then scrolls to it.
 */
export function OpenOnHash() {
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      for (let d: Element | null = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) (d as HTMLDetailsElement).open = true;
      el.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, []);
  return null;
}
