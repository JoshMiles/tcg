'use client';
import { useState } from 'react';
import { Icon } from '@/app/components/Icon';

/** Shares the profile link: the phone's share sheet where there is one, otherwise copies it. */
export function ShareProfile({ name }: { name: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function share() {
    const url = window.location.origin + window.location.pathname; // the profile itself, never a tab or filter
    try {
      if (navigator.share) { await navigator.share({ title: `${name} on The Cheesy TCG`, url }); return; }
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return; // they closed the share sheet
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2000);
  }
  return (
    <button type="button" onClick={share} className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-200 bg-white/[0.06] border border-white/10 hover:bg-white/10 rounded-full px-3 py-1.5 transition-colors">
      <Icon name={state === 'copied' ? 'check' : 'link'} className={state === 'copied' ? 'text-green-400' : ''} />
      {state === 'copied' ? 'Link copied' : state === 'failed' ? 'Could not copy' : 'Share'}
    </button>
  );
}
