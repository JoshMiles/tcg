'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const KEY = 'tcg_cookie_notice';
const EVENT = 'tcg:cookie-notice';

// Runs before first paint: hides the server-rendered notice for a visitor who already dismissed it (globals.css `.cookie-notice`).
const HIDE_IF_SEEN = `try{if(localStorage.getItem('${KEY}'))document.documentElement.setAttribute('data-cookie-ok','')}catch(e){}`;

/**
 * Light notice: the site only sets essential cookies (login), so there is nothing to opt in to.
 * Rendered on the server (open) so it paints with the page instead of after hydration, where it was the leaderboard's LCP.
 */
export function CookieNotice() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try { if (localStorage.getItem(KEY)) setOpen(false); } catch { /* keep it open */ }
    const show = () => { document.documentElement.removeAttribute('data-cookie-ok'); setOpen(true); };
    window.addEventListener(EVENT, show);
    return () => window.removeEventListener(EVENT, show);
  }, []);

  if (!open) return null;
  const dismiss = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* remembered for this visit only */ }
    setOpen(false);
  };

  return (
    <div role="region" aria-label="Cookie notice" className="cookie-notice fixed inset-x-0 bottom-0 z-80 p-3 sm:p-4 pointer-events-none">
      <script dangerouslySetInnerHTML={{ __html: HIDE_IF_SEEN }} />
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-gray-700 bg-gray-900/95 backdrop-blur-sm p-4 shadow-2xl flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-gray-300 leading-relaxed flex-1">
          We only use <strong className="text-white">essential cookies</strong> (to keep you logged in). No advertising or tracking cookies, so there&rsquo;s nothing to switch off.{' '}
          <Link href="/privacy" className="text-yellow-400 hover:text-yellow-300 underline">Privacy Policy</Link>
        </p>
        <button type="button" onClick={dismiss} className="shrink-0 rounded-xl bg-yellow-400 px-5 py-2 text-sm font-bold text-gray-950 hover:bg-yellow-300">Got it</button>
      </div>
    </div>
  );
}

/** Footer link that reopens the notice. */
export function CookieSettingsLink() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(EVENT))} className="hover:text-white transition-colors">Cookies</button>
  );
}
