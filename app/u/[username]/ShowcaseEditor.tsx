'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { saveShowcaseAction } from './actions';

export interface ShowcaseChoice { uid: number; name: string; thumb: string; tag?: string }

/** Owner-only: pick up to 3 editions for the Showcase widget. */
export function ShowcaseEditor({ candidates, selected }: { candidates: ShowcaseChoice[]; selected: number[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(selected);
  const [error, setError] = useState('');
  const [busy, start] = useTransition();
  const router = useRouter();

  function toggle(uid: number) {
    setPicked(p => (p.includes(uid) ? p.filter(x => x !== uid) : p.length >= 3 ? p : [...p, uid]));
  }
  function save() {
    setError('');
    start(async () => {
      const r = await saveShowcaseAction(picked);
      if (!r.ok) { setError(r.error); return; }
      setPicked(r.uids);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => { setPicked(selected); setOpen(true); }} className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-200 bg-white/6 border border-white/10 hover:bg-white/10 rounded-full px-3 py-1.5">
        <Icon name="pencil" />Edit showcase
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">Pick up to 3 prints ({picked.length}/3). Leave them all off to show your three most valuable.</p>
      <ul className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {candidates.map(c => {
          const on = picked.includes(c.uid);
          return (
            <li key={c.uid}>
              <button type="button" onClick={() => toggle(c.uid)} aria-pressed={on} aria-label={c.name} className={`relative block w-full rounded-lg overflow-hidden border-2 ${on ? 'border-yellow-400' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.thumb} alt="" className="w-full aspect-2/3 object-cover bg-gray-900" />
                {on && <span className="absolute top-1 right-1 rounded-full bg-yellow-400 text-gray-950 w-5 h-5 grid place-items-center text-[11px]"><Icon name="check" /></span>}
                {c.tag && <span className="absolute bottom-1 left-1 rounded-sm bg-black/70 text-yellow-300 text-[10px] font-bold px-1">{c.tag}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className="btn btn-primary px-3 py-1.5 text-xs rounded-full disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={() => { setOpen(false); setError(''); }} className="text-xs font-bold text-gray-300 px-3 py-1.5">Cancel</button>
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>
    </div>
  );
}
