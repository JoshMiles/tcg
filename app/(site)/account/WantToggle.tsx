'use client';
import { useState, useTransition } from 'react';
import { Icon } from '@/app/components/Icon';
import { toggleWantedAction } from '../cards/actions';

/** Adds / removes one card on the viewer's Looking for list (the profile wishlist) without leaving the page. */
export function WantToggle({ number, initial }: { number: number; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" disabled={pending} aria-pressed={on} onClick={() => {
        setError('');
        start(async () => {
          const res = await toggleWantedAction(number);
          if (res.ok) setOn(res.wanted.includes(number)); else setError(res.error);
        });
      }} className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-full border px-2.5 py-1 transition-colors disabled:opacity-60 ${on ? 'border-purple-400/60 bg-purple-500/20 text-purple-100' : 'border-white/10 bg-white/6 text-gray-300 hover:bg-white/10'}`}>
        <Icon name="search" className="w-3 h-3" />{on ? 'Looking for' : 'Look for'}
      </button>
      {error && <span role="alert" className="text-[10px] text-red-400 max-w-48 text-right">{error}</span>}
    </span>
  );
}
