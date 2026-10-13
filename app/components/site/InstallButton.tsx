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
 * It stays hidden once the app is installed, inside another app's browser that can't add sites, and on a computer whose browser has
 * no install option.
 */
export function InstallButton() {
  const [state, setState] = useState<'hidden' | 'prompt' | 'guide'>('hidden');

  useEffect(() => {
    const sync = () => {
      if (isStandalone() || wasInstalled()) { setState('hidden'); return; }
      if (getInstallPrompt()) { setState('prompt'); return; }
      const env = detectInstallEnv(navigator.userAgent, navigator.maxTouchPoints);
      setState(env.platform !== 'desktop' && !env.inApp ? 'guide' : 'hidden');
    };
    sync();
    return subscribeInstall(sync);
  }, []);

  if (state === 'hidden') return null;
  if (state === 'prompt') {
    return (
      <button type="button" onClick={() => { void askToInstall(); }} className={BUTTON} title="Install the app" aria-label="Install the app">
        <Icon name="download" />
      </button>
    );
  }
  return (
    <Link href="/install" className={BUTTON} title="Add to your home screen" aria-label="Get the app: add to your home screen">
      <Icon name="download" />
    </Link>
  );
}
