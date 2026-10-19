'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { favouriteCopyAction } from '@/app/(entity)/copy/actions';

/** Favourite this print: it then can't be traded or spent in an upgrade. Only shown to the edition's holder. */
export function FavouriteCopyButton({ uid, favourite }: { uid: number; favourite: boolean }) {
  const [on, setOn] = useState(favourite);
  const [error, setError] = useState('');
  const [busy, start] = useTransition();
  const router = useRouter();

  function go() {
    setError('');
    start(async () => {
      const r = await favouriteCopyAction(uid, !on);
      if (!r.ok) { setError(r.error); return; }
      setOn(r.favourite);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={go} disabled={busy} aria-pressed={on} title="A favourite edition can't be traded or spent in an upgrade"
        className={`inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 border transition-colors disabled:opacity-60 ${on ? 'text-pink-300 bg-pink-500/10 border-pink-500/40 hover:bg-pink-500/20' : 'text-gray-200 bg-white/6 border-white/10 hover:bg-white/10'}`}>
        <Icon name="heart" />{busy ? 'Saving…' : on ? 'Favourite · Remove' : 'Favourite'}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  );
}
