'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { detectInstallEnv } from '@/lib/install-detect';

const KEY = 'tcg_install_hint';

/** A phone-only nudge on the home page to add the site to the home screen. Gone once dismissed or once it is installed. */
export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(KEY)) return; } catch { /* show it, it just may come back */ }
    const env = detectInstallEnv(navigator.userAgent, navigator.maxTouchPoints);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (env.platform !== 'desktop' && !standalone) setShow(true);
  }, []);

  if (!show) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } setShow(false); };
  return (
    <aside className="sm:hidden rounded-2xl border border-yellow-500/30 bg-yellow-500/6 p-4 flex items-start gap-3" aria-label="Add to home screen">
      <Icon name="phone" className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white">Add the app to your home screen</p>
        <p className="text-sm text-gray-400 mt-0.5">Open your collection in one tap, full screen.</p>
        <Link href="/install" className="inline-block mt-2 text-sm font-bold text-yellow-400 hover:text-yellow-300">Show me how →</Link>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-gray-500 hover:text-white p-1"><Icon name="x" /></button>
    </aside>
  );
}
