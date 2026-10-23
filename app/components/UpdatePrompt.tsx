'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/app/components/Icon';

const CHECK_EVERY_MS = 10 * 60 * 1000;

/**
 * "A new version is available" toast. `commit` is the build this page was served from; it is compared with the live one from
 * /api/version when the tab becomes visible and every 10 minutes while it stays visible. Never reloads by itself.
 */
export function UpdatePrompt({ commit, env }: { commit: string; env: string }) {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (env === 'development' || commit === 'unknown') return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const check = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const data = (await res.json()) as { commit?: string };
        if (data.commit && data.commit !== 'unknown') setLatest(data.commit);
      } catch { /* offline: try again later */ }
    };
    const onVisibility = () => {
      clearInterval(timer);
      if (document.visibilityState !== 'visible') return;
      void check();
      timer = setInterval(check, CHECK_EVERY_MS);
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [commit, env]);

  if (!latest || latest === commit || latest === dismissed) return null;
  return (
    <div role="status" className="fixed bottom-20 xl:bottom-4 left-1/2 -translate-x-1/2 z-80 flex items-center gap-3 rounded-xl border border-yellow-500/40 bg-gray-900/95 px-4 py-2.5 text-sm text-gray-100 shadow-2xl backdrop-blur-sm">
      <span>A new version is available</span>
      <button type="button" onClick={() => location.reload()} className="inline-flex items-center gap-1.5 rounded-lg bg-yellow-400 px-3 py-1 text-xs font-bold text-gray-950 hover:bg-yellow-300">
        <Icon name="refresh" /> Refresh
      </button>
      <button type="button" onClick={() => setDismissed(latest)} aria-label="Dismiss" className="text-gray-400 hover:text-white">
        <Icon name="x" />
      </button>
    </div>
  );
}
