'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SiteSkeleton } from './SiteMessage';

/** Swaps the page for `SiteSkeleton` the moment an internal link to another path is clicked, until that page arrives. Stands in for
 *  `loading.tsx`, which most public pages can't have (see docs/public-site/basics.md, "Frames and states"). Same-path `?param` and `#hash`
 *  links keep the page as it is.
 *  shortcut: guesses the router's pending state from the click, so a link whose own onClick cancels navigation would still show the
 *  skeleton (none does today); delete this for `loading.tsx` after the Next 16 upgrade (ROADMAP 43.1). */
export function PendingPage({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [from, setFrom] = useState<string | null>(null); // the path the click left; the skeleton shows only while we are still on it
  const scrollY = useRef(0); // where the reader was, restored if the navigation never lands
  const restore = () => { setFrom(null); requestAnimationFrame(() => window.scrollTo(0, scrollY.current)); };

  useEffect(() => {
    setFrom(null);
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href);
      // /api/ and /auth/ answer with a file or a redirect (often off-site), never a page in this tab.
      if (url.origin !== location.origin || url.pathname === location.pathname || /^\/(api|auth)\//.test(url.pathname)) return;
      scrollY.current = window.scrollY;
      setFrom(location.pathname);
      window.scrollTo(0, 0);
    };
    const onPopState = () => setFrom(null); // Back / Forward mid-load: the router handles that scroll itself
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) restore(); }; // back from another site via the back/forward cache
    document.addEventListener('click', onClick);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [pathname]);

  // A navigation that never lands (an error, a redirect back here) must not leave the skeleton up.
  useEffect(() => {
    if (!from) return;
    const t = setTimeout(restore, 10_000);
    return () => clearTimeout(t);
  }, [from]);

  const pending = from === pathname;
  return <>
    <div hidden={pending}>{children}</div>
    {pending && <SiteSkeleton />}
  </>;
}
