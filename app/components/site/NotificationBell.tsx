'use client';
import { Icon } from '@/app/components/Icon';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TradeCeremony } from '../TradeCeremony';
import { NOTICE_ICON, type Notice, type Swap } from '@/lib/trade-notice-core';
import { currentSubscription, enablePush, pushSupport } from '@/lib/push-client';
import { IDLE_AFTER_MS, freshNotices, pollDelay, titleWithCount } from '@/lib/notice-poll-core';

const PLAYED_KEY = 'tcg_trade_played';
const FRESH_MS = 15 * 60_000; // an accepted trade older than this doesn't auto-play
const TOAST_MS = 7000;
const TOAST_MAX = 3;

const ago = (at: number) => {
  const m = Math.floor((Date.now() - at) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};
const readPlayed = (): string[] => { try { return JSON.parse(localStorage.getItem(PLAYED_KEY) || '[]'); } catch { return []; } };
const writePlayed = (ids: string[]) => { try { localStorage.setItem(PLAYED_KEY, JSON.stringify(ids.slice(-50))); } catch { /* storage unavailable */ } };

const OFFER_KEY = 'tcg_push_offered';

/** Whether to suggest phone alerts: the server has them, this browser can, nobody has been asked here yet and it is not on already. Asks once. */
async function shouldOfferPush(): Promise<string | null> {
  try {
    if (localStorage.getItem(OFFER_KEY) || pushSupport() !== 'ok' || Notification.permission !== 'default') return null;
    const r = await fetch('/api/account/push', { cache: 'no-store' });
    const info = r.ok ? await r.json() : null;
    if (!info?.enabled || await currentSubscription()) return null;
    localStorage.setItem(OFFER_KEY, '1');
    return info.publicKey as string;
  } catch { return null; }
}

/** A short two-note chime (no audio file). Browsers refuse it until the viewer has interacted with the page; that is fine. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t = ctx.currentTime;
    [660, 880].forEach((hz, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.3);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.32);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch { /* no audio */ }
}

/**
 * The bell in the site nav: trade offers and what happened to yours (accepted, declined, cancelled, expired). It polls with the
 * version of the list it already has (the server answers 204 when nothing changed): every 10s while the tab is visible, every 60s
 * after 5 minutes without input, not at all while hidden, and at once on focus or after a trade action. A new notice shakes the
 * bell, pulses the badge, shows a toast, puts (N) in the tab title and the app icon badge, and chimes if the viewer asked for that.
 * When someone accepts one of your offers the trade animation plays once.
 */
export function NotificationBell() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [seen, setSeen] = useState(0);
  const [open, setOpen] = useState(false);
  const [swap, setSwap] = useState<Swap | null>(null);
  const [toasts, setToasts] = useState<Notice[]>([]);
  const [mounted, setMounted] = useState(false); // the toasts live on <body>: the sticky nav would otherwise be their positioning box
  useEffect(() => setMounted(true), []);
  const [offerPush, setOfferPush] = useState<string | null>(null); // the VAPID key while the one-off "Get alerts on this device" card under the toasts
  const [alertN, setAlertN] = useState(0); // bumps on each new notice to restart the shake and pulse
  const ref = useRef<HTMLDivElement>(null);
  const showing = useRef(false);
  const version = useRef<number | null>(null);
  const announced = useRef<Set<string> | null>(null); // null until the first load: what was already there is not announced
  const lastInput = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loading = useRef(false);
  const openRef = useRef(false);
  openRef.current = open;

  const dismiss = useCallback((id: string) => setToasts(t => t.filter(x => x.id !== id)), []);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const q = version.current === null ? '' : `?since=${version.current}`;
      const res = await fetch(`/api/notifications${q}`, { cache: 'no-store' });
      if (!res.ok || res.status === 204) return;
      const body = (await res.json()) as { notices: Notice[]; seen: number; v?: number; sound?: boolean };
      if (typeof body.v === 'number') version.current = body.v;
      setNotices(body.notices);
      setSeen(s => Math.max(s, body.seen));
      const known = announced.current;
      if (known === null) {
        announced.current = new Set(body.notices.map(n => n.id));
      } else {
        const fresh = freshNotices(body.notices, body.seen, known);
        fresh.forEach(n => known.add(n.id));
        if (fresh.length > 0) {
          setAlertN(a => a + 1);
          if (!openRef.current) {
            const shown = [...fresh].sort((x, y) => x.at - y.at);
            setToasts(t => [...t, ...shown].slice(-TOAST_MAX));
            shown.forEach(n => setTimeout(() => dismiss(n.id), TOAST_MS));
            if (shown.some(n => n.kind === 'offer' || n.kind === 'countered')) void shouldOfferPush().then(key => { if (key) setOfferPush(key); });
          }
          if (body.sound) chime();
        }
      }
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
    finally { loading.current = false; }
  }, [dismiss]);

  useEffect(() => {
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const delay = pollDelay(document.visibilityState === 'hidden', Date.now() - lastInput.current);
      if (delay === null) return; // hidden: the visibility handler checks at once when the tab is shown again
      timer.current = setTimeout(() => { load().finally(schedule); }, delay);
    };
    const checkNow = () => { load().finally(schedule); };
    const onVis = () => {
      if (document.visibilityState === 'visible') { lastInput.current = Date.now(); checkNow(); } else schedule();
    };
    const onInput = () => {
      const wasIdle = Date.now() - lastInput.current >= IDLE_AFTER_MS;
      lastInput.current = Date.now();
      if (wasIdle) checkNow();
    };
    const inputs = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    checkNow();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', checkNow);
    window.addEventListener('tcg:notices-check', checkNow);
    inputs.forEach(e => window.addEventListener(e, onInput, { passive: true }));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', checkNow);
      window.removeEventListener('tcg:notices-check', checkNow);
      inputs.forEach(e => window.removeEventListener(e, onInput));
    };
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

  // (N) in the tab title (kept when the page changes the title) and the installed app's icon badge.
  useEffect(() => {
    const apply = () => { const t = titleWithCount(document.title, unread); if (t !== document.title) document.title = t; };
    apply();
    const el = document.querySelector('title');
    const mo = el ? new MutationObserver(apply) : null;
    if (el && mo) mo.observe(el, { childList: true, characterData: true, subtree: true });
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      if (unread > 0) nav.setAppBadge?.(unread)?.catch(() => {});
      else nav.clearAppBadge?.()?.catch(() => {});
    } catch { /* unsupported */ }
    return () => { mo?.disconnect(); };
  }, [unread]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) setToasts([]);
    if (next && unread > 0) {
      // Show them as unread for this opening, then mark everything read.
      fetch('/api/notifications', { method: 'POST' }).catch(() => {});
      setTimeout(() => setSeen(Date.now()), 1500);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        key={alertN}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications (${unread} new)` : 'Notifications'}
        className={`${alertN > 0 ? 'bell-shake ' : ''}relative w-9 h-9 rounded-full border border-gray-700 text-gray-300 hover:text-white hover:border-yellow-500/50 flex items-center justify-center transition-colors`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className={`${alertN > 0 ? 'badge-pulse ' : ''}absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-gray-950`}>
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
                      {n.kind === 'watch' && <Link href="/trade?tab=board" onClick={() => setOpen(false)} className="font-semibold text-yellow-400 hover:text-yellow-300">See the listing</Link>}
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
          <div className="border-t border-gray-800 px-3 py-2 text-center">
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-yellow-400 hover:text-yellow-300">See all notifications</Link>
          </div>
        </div>
      )}
      {mounted && createPortal(<div aria-live="polite" className="fixed z-[60] top-16 right-4 left-4 sm:left-auto sm:w-80 flex flex-col gap-2 pointer-events-none">
        {toasts.map(n => (
          <div key={n.id} className="notice-toast pointer-events-auto flex gap-2.5 rounded-xl border border-yellow-500/40 bg-gray-900 px-3 py-2.5 shadow-card">
            <Icon name={NOTICE_ICON[n.kind]} className="w-5 h-5 mt-0.5 shrink-0 text-yellow-400" />
            <Link href={n.kind === 'watch' ? '/trade?tab=board' : '/trade'} onClick={() => dismiss(n.id)} className="min-w-0 flex-1 text-[13px] leading-snug text-gray-100 break-words hover:text-white">{n.text}</Link>
            <button type="button" onClick={() => dismiss(n.id)} aria-label="Dismiss" className="shrink-0 self-start text-gray-500 hover:text-white"><Icon name="x" className="w-4 h-4" /></button>
          </div>
        ))}
        {offerPush && (
          <div className="notice-toast pointer-events-auto flex gap-2.5 rounded-xl border border-yellow-500/40 bg-gray-900 px-3 py-2.5 shadow-card">
            <Icon name="bell" className="w-5 h-5 mt-0.5 shrink-0 text-yellow-400" />
            <div className="min-w-0 flex-1 text-[13px] leading-snug text-gray-100">
              <p>Want to hear about offers when the site is closed?</p>
              <button type="button" onClick={() => { setOfferPush(null); void enablePush(offerPush).catch(() => {}); }}
                className="mt-1 font-semibold text-yellow-400 hover:text-yellow-300">Get alerts on this device</button>
            </div>
            <button type="button" onClick={() => setOfferPush(null)} aria-label="Dismiss" className="shrink-0 self-start text-gray-500 hover:text-white"><Icon name="x" className="w-4 h-4" /></button>
          </div>
        )}
      </div>, document.body)}
      {swap && <TradeCeremony swap={swap} onClose={() => { showing.current = false; setSwap(null); }} />}
    </div>
  );
}
