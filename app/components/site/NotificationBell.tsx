'use client';
import { Icon } from '@/app/components/Icon';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TradeCeremony } from '../TradeCeremony';
import { NOTICE_ICON, type Notice, type Swap } from '@/lib/trade-notice-core';

const PLAYED_KEY = 'tcg_trade_played';
const POLL_MS = 45_000;
const FRESH_MS = 15 * 60_000; // an accepted trade older than this doesn't auto-play

const ago = (at: number) => {
  const m = Math.floor((Date.now() - at) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};
const readPlayed = (): string[] => { try { return JSON.parse(localStorage.getItem(PLAYED_KEY) || '[]'); } catch { return []; } };
const writePlayed = (ids: string[]) => { try { localStorage.setItem(PLAYED_KEY, JSON.stringify(ids.slice(-50))); } catch { /* storage unavailable */ } };

/**
 * The bell in the site nav: trade offers and what happened to yours (accepted, declined, cancelled, expired). It polls
 * every 45s and when the tab comes back into view. When someone accepts one of your offers the trade animation plays once.
 */
export function NotificationBell() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [seen, setSeen] = useState(0);
  const [open, setOpen] = useState(false);
  const [swap, setSwap] = useState<Swap | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const showing = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as { notices: Notice[]; seen: number };
      setNotices(body.notices);
      setSeen(s => Math.max(s, body.seen));
      // A trade of yours was accepted while you were away or on another page: play it once.
      if (!showing.current) {
        const played = readPlayed();
        const fresh = body.notices.find(n => n.kind === 'accepted' && n.swap && n.at > body.seen && Date.now() - n.at < FRESH_MS && !played.includes(n.id));
        if (fresh?.swap) {
          showing.current = true;
          writePlayed([...played, fresh.id]);
          setSwap(fresh.swap);
        }
      }
    } catch { /* offline: try again next time */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const unread = notices.filter(n => n.at > seen).length;
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      // Show them as unread for this opening, then mark everything read.
      fetch('/api/notifications', { method: 'POST' }).catch(() => {});
      setTimeout(() => setSeen(Date.now()), 1500);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications (${unread} new)` : 'Notifications'}
        className="relative w-9 h-9 rounded-full border border-gray-700 text-gray-300 hover:text-white hover:border-yellow-500/50 flex items-center justify-center transition-colors"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-gray-950">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(22rem,92vw)] max-h-[26rem] overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 shadow-card z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
            <p className="text-sm font-bold text-white">Notifications</p>
            <Link href="/trade" className="text-xs font-semibold text-yellow-400 hover:text-yellow-300">Open Trade →</Link>
          </div>
          {notices.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">Nothing yet. Trade offers and their results show up here.</p>
          ) : (
            <ul className="divide-y divide-gray-800/70">
              {notices.map(n => (
                <li key={n.id} className={`px-3 py-2.5 flex gap-2.5 ${n.at > seen ? 'bg-yellow-500/[0.06]' : ''}`}>
                  <Icon name={NOTICE_ICON[n.kind]} className="w-5 h-5 mt-0.5 text-yellow-400/90" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-gray-200 break-words">{n.text}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-gray-500">
                      <span>{ago(n.at)}</span>
                      {(n.kind === 'offer' || n.kind === 'countered') && <Link href="/trade" onClick={() => setOpen(false)} className="font-semibold text-yellow-400 hover:text-yellow-300">View offer</Link>}
                      {n.kind === 'accepted' && n.swap && (
                        <button type="button" onClick={() => { setOpen(false); showing.current = true; setSwap(n.swap!); }} className="font-semibold text-sky-300 hover:text-sky-200"><Icon name="play" className="mr-1 w-3 h-3" />Replay</button>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {swap && <TradeCeremony swap={swap} onClose={() => { showing.current = false; setSwap(null); }} />}
    </div>
  );
}
