'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { reportProblemUrl } from '@/lib/site';

const KEY = 'tcg_beta_banner';

/** A thin strip above the nav while the site is labelled alpha / beta. Dismissible for this browser session; it is back on the next visit. */
export function BetaBanner({ text }: { text: string }) {
  const path = usePathname();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { if (sessionStorage.getItem(KEY) === '1') setHidden(true); } catch { /* storage blocked: just show it */ }
  }, []);
  if (hidden) return null;
  return (
    <div role="region" aria-label="Testing notice" className="relative z-40 border-b border-purple-400/30 bg-purple-950/80 text-purple-100">
      <div className="max-w-6xl mx-auto px-4 py-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap text-xs">
        <span className="min-w-0 flex-1 basis-48">{text}</span>
        <span className="flex shrink-0 items-center gap-2 ml-auto">
        <a href={reportProblemUrl(path)} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2 hover:text-white">Report a problem</a>
        <button
          type="button"
          aria-label="Dismiss the testing notice"
          onClick={() => { setHidden(true); try { sessionStorage.setItem(KEY, '1'); } catch { /* fine */ } }}
          className="shrink-0 rounded-sm p-1 hover:bg-white/10"
        ><Icon name="x" /></button>
        </span>
      </div>
    </div>
  );
}
