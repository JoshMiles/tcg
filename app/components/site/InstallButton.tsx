'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { detectInstallEnv } from '@/lib/install-detect';
import { askToInstall, getInstallPrompt, isStandalone, subscribeInstall, wasInstalled } from './install-store';

const BUTTON = 'inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-700 text-gray-300 hover:text-yellow-300 hover:border-yellow-500/50 transition-colors';

/**
 * The top bar's "install the app" icon. Where the browser can install the site in one tap (Chrome, Edge, Android) it opens the browser's
 * own install dialog; otherwise it opens the how-to page (iPhone and iPad have no install dialog, they use Share, Add to Home Screen).
 * It only shows on phones and tablets (computers reach /install from the footer and the site menu), and stays hidden once the app is
 * installed and inside another app's browser that can't add sites.
 */
export function InstallButton({ row }: { row?: boolean } = {}) {
  const [state, setState] = useState<'hidden' | 'prompt' | 'guide'>('hidden');

  useEffect(() => {
    const sync = () => {
      if (isStandalone() || wasInstalled()) { setState('hidden'); return; }
      const env = detectInstallEnv(navigator.userAgent, navigator.maxTouchPoints);
      if (env.platform === 'desktop') { setState('hidden'); return; }
      if (getInstallPrompt()) { setState('prompt'); return; }
      setState(!env.inApp ? 'guide' : 'hidden');
    };
    sync();
    return subscribeInstall(sync);
  }, []);

  if (state === 'hidden') return null;
  const cls = row ? 'flex items-center px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-300 hover:bg-white/5 text-left w-full' : BUTTON;
  const text = row && <span className="ml-1.5">Install app</span>;
  if (state === 'prompt') {
    return (
      <button type="button" onClick={() => { void askToInstall(); }} className={cls} title="Install the app" aria-label="Install the app">
        <Icon name="download" />{text}
      </button>
    );
  }
  return (
    <Link href="/install" className={cls} title="Add to your home screen" aria-label="Get the app: add to your home screen">
      <Icon name="download" />{text}
    </Link>
  );
}
