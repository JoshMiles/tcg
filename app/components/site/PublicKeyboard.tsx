'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isTypingTarget } from '@/lib/shortcuts';
import { PUBLIC_GO_KEYS, nextPublicKey, PUBLIC_IDLE, type PublicSeq } from '@/lib/public-shortcuts';

/** The "Keyboard shortcuts" experiment: g then a letter jumps around the site, ? lists them. Only mounted when the viewer opted in. */
export function PublicKeyboard({ username }: { username?: string }) {
  const router = useRouter();
  const seq = useRef<PublicSeq>(PUBLIC_IDLE);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === 'Escape') { setHelp(false); return; }
      if (e.key === '?') { setHelp(h => !h); return; }
      const r = nextPublicKey(seq.current, e.key, Date.now(), username);
      seq.current = r.state;
      if (r.go) { e.preventDefault(); router.push(r.go); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, username]);

  if (!help) return null;
  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/60 p-4" onClick={() => setHelp(false)}>
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={e => e.stopPropagation()} className="tcg-panel rounded-2xl p-5 w-full max-w-sm">
        <h2 className="font-display text-xl font-bold text-white mb-3">Keyboard shortcuts</h2>
        <ul className="space-y-1.5 text-sm">
          {PUBLIC_GO_KEYS.filter(k => username || !k.needsLogin).map(k => (
            <li key={k.key} className="flex justify-between text-gray-300"><span>{k.label}</span><span><kbd className="kbd">g</kbd> <kbd className="kbd">{k.key}</kbd></span></li>
          ))}
          <li className="flex justify-between text-gray-300"><span>Search</span><kbd className="kbd">/</kbd></li>
          <li className="flex justify-between text-gray-300"><span>This list</span><kbd className="kbd">?</kbd></li>
        </ul>
        <button onClick={() => setHelp(false)} className="mt-4 text-xs text-gray-400 hover:text-white">Close (Esc)</button>
      </div>
    </div>
  );
}
