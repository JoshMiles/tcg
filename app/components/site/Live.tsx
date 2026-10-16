'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LiveStatus } from '@/lib/twitch-live';
import { CHANNEL_NAME, CHANNEL_URL } from '@/lib/site';

const POLL_MS = 60_000;

const LiveContext = createContext<LiveStatus | null>(null);

/** One shared poll of /api/live for the whole page, starting from the server-rendered status (so no flicker). */
export function LiveProvider({ initial, children }: { initial: LiveStatus | null; children: ReactNode }) {
  const [status, setStatus] = useState<LiveStatus | null>(initial);

  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return; // don't poll from background tabs
      try {
        // no-store: skip the browser's own cache (the server/CDN cache already limits Twitch calls), or a stale answer lingers
        const res = await fetch('/api/live', { cache: 'no-store' });
        if (res.ok && !stopped) setStatus(await res.json());
      } catch {
        // keep the last known status
      }
    };
    const id = setInterval(refresh, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  return <LiveContext.Provider value={status}>{children}</LiveContext.Provider>;
}

const useLive = () => useContext(LiveContext);

function viewersText(n?: number) {
  return typeof n === 'number' ? `${n.toLocaleString()} watching` : '';
}

/** Small red pill for the nav: only renders while the channel is live. */
export function LiveBadge() {
  const live = useLive();
  if (!live?.live) return null;
  const details = [live.title, live.game, viewersText(live.viewers)].filter(Boolean).join(' · ');
  return (
    <a
      href={CHANNEL_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={`${CHANNEL_NAME} is live${details ? `, ${details}` : ''}`}
      aria-label={`${CHANNEL_NAME} is live on Twitch`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider text-white bg-red-600 hover:bg-red-500 transition-colors"
    >
      <span className="live-dot w-1.5 h-1.5 rounded-full bg-white" />
      Live
    </a>
  );
}

/** Full-width strip above the home hero: one line of channel, title, game and viewers, and a Watch button at the right (stacked on phones). Only renders while live. */
export function LiveBanner() {
  const live = useLive();
  if (!live?.live) return null;
  return (
    <a
      href={CHANNEL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-2 rounded-2xl border border-red-500/40 bg-red-950/30 hover:bg-red-950/50 px-4 py-3 transition-colors"
    >
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider text-white bg-red-600 self-start sm:self-auto shrink-0">
        <span className="live-dot w-1.5 h-1.5 rounded-full bg-white" /> Live now
      </span>
      <span className="flex-1 min-w-0 text-sm text-red-50 sm:truncate">
        <span className="font-semibold">{CHANNEL_NAME}</span> is streaming
        {live.title ? <> · <span className="text-red-200">{live.title}</span></> : null}
        {live.game ? <> · <span className="text-red-200/80">{live.game}</span></> : null}
        {typeof live.viewers === 'number' ? <> · <span className="text-red-200">{viewersText(live.viewers)}</span></> : null}
      </span>
      <span className="text-xs font-bold text-white bg-[#9146ff] rounded-lg px-3 py-2 sm:py-1.5 shrink-0 text-center">Watch on Twitch ↗</span>
    </a>
  );
}
