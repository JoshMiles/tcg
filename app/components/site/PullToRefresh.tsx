'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { isStandalone } from './install-store';

const THRESHOLD = 70; // px of (resisted) pull needed to refresh
const RESISTANCE = 0.7;
const MAX_PULL = 110;

/** True when the touch started somewhere a pull should not take over: a sheet / dialog, a form field, or a scroller not at its top. */
function blocked(el: Element | null): boolean {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    if (n.matches('[role="dialog"], input, textarea, select, [contenteditable]')) return true;
    if (n.scrollTop > 0 && /auto|scroll/.test(getComputedStyle(n).overflowY)) return true;
  }
  return false;
}

/**
 * Pull to refresh for the installed app only (a home-screen app has no reload button; browser tabs have their own). Drag down from the
 * very top of the page past THRESHOLD and let go: `router.refresh()` re-fetches the server data and keeps client state.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [busy, startRefresh] = useTransition();
  const [pull, setPull] = useState(0);
  const [reduced, setReduced] = useState(false);
  const pullRef = useRef(0);

  useEffect(() => {
    if (!isStandalone()) return;
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let startY: number | null = null;
    const set = (v: number) => { pullRef.current = v; setPull(v); };
    const onStart = (e: TouchEvent) => {
      startY = e.touches.length === 1 && window.scrollY === 0 && !blocked(e.target as Element) ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0 || e.touches.length > 1) { startY = null; set(0); return; }
      set(Math.min(dy * RESISTANCE, MAX_PULL));
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      if (pullRef.current >= THRESHOLD) startRefresh(() => router.refresh());
      set(0);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [router]);

  if (pull === 0 && !busy) return null;
  const shown = busy ? THRESHOLD : pull;
  const ready = shown >= THRESHOLD;
  return (
    <div
      role="status"
      aria-label={busy ? 'Refreshing' : undefined}
      className="fixed left-1/2 z-40 pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top) + 3.5rem)', transform: `translate(-50%, ${shown - 40}px)`, transition: pull === 0 && !reduced ? 'transform .2s' : undefined }}
    >
      <span className={`flex items-center justify-center w-9 h-9 rounded-full border bg-gray-900 shadow-lg ${ready ? 'border-yellow-400 text-yellow-300' : 'border-gray-700 text-gray-400'}`}>
        <span className={busy && !reduced ? 'animate-spin inline-flex' : 'inline-flex'} style={reduced || busy ? undefined : { transform: `rotate(${(shown / THRESHOLD) * 270}deg)` }}>
          <Icon name="refresh" />
        </span>
      </span>
    </div>
  );
}

/** "Refresh" row for the More sheet: the non-gesture route, installed app only. */
export function RefreshRow() {
  const router = useRouter();
  const [busy, startRefresh] = useTransition();
  const [show, setShow] = useState(false);
  useEffect(() => setShow(isStandalone()), []);
  if (!show) return null;
  return (
    <button type="button" onClick={() => startRefresh(() => router.refresh())} className="flex items-center px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-300 hover:bg-white/5 text-left w-full">
      <Icon name="refresh" className={busy ? 'animate-spin' : ''} /><span className="ml-1.5">Refresh</span>
    </button>
  );
}