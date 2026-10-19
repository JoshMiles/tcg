'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { pinCopyAction } from '@/app/(entity)/copy/actions';

/** Pin this copy as your profile's Showcase copy (or unpin it). Only shown to the copy's holder. */
export function PinCopyButton({ uid, pinned, label = 'Pin to my profile' }: { uid: number; pinned: boolean; label?: string }) {
  const [isPinned, setPinned] = useState(pinned);
  const [error, setError] = useState('');
  const [busy, start] = useTransition();
  const router = useRouter();

  function go() {
    setError('');
    start(async () => {
      const r = await pinCopyAction(isPinned ? null : uid);
      if (!r.ok) { setError(r.error); return; }
      setPinned(r.pinned === uid);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={go} disabled={busy} aria-pressed={isPinned}
        className={`inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 border transition-colors disabled:opacity-60 ${isPinned ? 'text-yellow-300 bg-yellow-500/10 border-yellow-500/40 hover:bg-yellow-500/20' : 'text-gray-200 bg-white/6 border-white/10 hover:bg-white/10'}`}>
        <Icon name="pin" />{busy ? 'Saving…' : isPinned ? 'Pinned to your profile · Unpin' : label}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  );
}
