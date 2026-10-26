'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { OverlayStatus } from '@/lib/overlay';

const POLL_MS = 5000;

interface Value {
  status: OverlayStatus | null;
  failed: boolean;
  /** Timestamp of the last successful poll, for rendering "last seen … ago". */
  now: number;
}

const Ctx = createContext<Value>({ status: null, failed: false, now: 0 });

/**
 * One poller for the whole admin shell: the sidebar indicator, the dashboard header and the quick
 * actions all read the same status. Polls /api/admin/overlay-status while the tab is visible.
 */
export function OverlayStatusProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Value>({ status: null, failed: false, now: 0 });

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    async function poll() {
      try {
        const res = await fetch('/api/admin/overlay-status', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const status = (await res.json()) as OverlayStatus;
        if (!cancelled) setValue({ status, failed: false, now: Date.now() });
      } catch {
        if (!cancelled) setValue(v => ({ ...v, failed: true }));
      }
    }
    // Nothing runs while the tab is hidden: the timer stops, and a poll plus the timer start again when it is shown.
    function sync() {
      clearInterval(interval);
      interval = undefined;
      if (document.visibilityState !== 'visible') return;
      poll();
      interval = setInterval(poll, POLL_MS);
    }
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { cancelled = true; clearInterval(interval); document.removeEventListener('visibilitychange', sync); };
  }, []);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOverlayStatus(): Value {
  return useContext(Ctx);
}
