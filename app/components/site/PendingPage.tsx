'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { SiteSkeleton } from './SiteMessage';

/** Swaps the page for `SiteSkeleton` the moment an internal link to another path is clicked, until that page arrives. Stands in for
 *  `loading.tsx`, which most public pages can't have (see docs/public-site/basics.md, "Frames and states"). Same-path `?param` and `#hash`
 *  links keep the page as it is. */
export function PendingPage({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [from, setFrom] = useState<string | null>(null); // the path the click left; the skeleton shows only while we are still on it

  useEffect(() => {
    setFrom(null);
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href);
      if (url.origin !== location.origin || url.pathname === location.pathname || url.pathname.startsWith('/api/')) return;
      setFrom(location.pathname);
      window.scrollTo(0, 0);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [pathname]);

  // A navigation that never lands (an error, a redirect back here) must not leave the skeleton up.
  useEffect(() => {
    if (!from) return;
    const t = setTimeout(() => setFrom(null), 10_000);
    return () => clearTimeout(t);
  }, [from]);

  const pending = from === pathname;
  return <>
    <div hidden={pending}>{children}</div>
    {pending && <SiteSkeleton />}
  </>;
}
