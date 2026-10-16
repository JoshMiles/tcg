'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { currentSubscription, enablePush, pushSupport } from '@/lib/push-client';
import { PROMPT_KEY, dismissed, isPhoneLike, parsePromptState, promptMode, type PromptMode } from '@/lib/push-prompt-core';

/**
 * A banner for signed-in viewers on a phone or the installed app: "Get trade offers on your phone". Shown only while push is
 * available, permission has not been decided and this device is not subscribed. "Not now" hides it for 14 days; after three
 * it stops. On an iPhone in Safari (which cannot ask yet) it points at the install guide instead. Renders nothing otherwise
 * (including when signed out: the API answers 401).
 */
export function PushPrompt() {
  const [mode, setMode] = useState<PromptMode>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch('/api/account/push', { cache: 'no-store' });
        const info = r.ok ? await r.json() as { enabled?: boolean; publicKey?: string } : null;
        if (!live || !info?.enabled) return;
        let state;
        try { state = parsePromptState(localStorage.getItem(PROMPT_KEY)); } catch { state = parsePromptState(null); }
        const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
        const m = promptMode({
          serverEnabled: true,
          phone: isPhoneLike(navigator.userAgent, navigator.maxTouchPoints, standalone),
          support: pushSupport(),
          permission: 'Notification' in window ? Notification.permission : 'unsupported',
          subscribed: !!(await currentSubscription()),
          state,
          now: Date.now(),
        });
        if (live && m) { setKey(info.publicKey ?? null); setMode(m); }
      } catch { /* no banner */ }
    })();
    return () => { live = false; };
  }, []);

  if (!mode) return null;

  const notNow = () => {
    try { localStorage.setItem(PROMPT_KEY, JSON.stringify(dismissed(parsePromptState(localStorage.getItem(PROMPT_KEY)), Date.now()))); } catch { /* storage unavailable: it just comes back next visit */ }
    setMode(null);
  };
  async function turnOn() {
    if (!key) return;
    setBusy(true); setMsg(null);
    try { await enablePush(key); setMode(null); }
    catch (e) {
      if (e instanceof Error && e.message === 'denied') setMode(null); // blocked: Settings explains how to allow it
      else setMsg(e instanceof Error ? e.message : 'Could not turn alerts on.');
    }
    setBusy(false);
  }

  return (
    <aside aria-label="Alerts" className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 flex flex-wrap items-center gap-3">
      <Icon name="bell" className="w-6 h-6 text-yellow-400 shrink-0" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-bold text-white">{mode === 'install' ? 'Install the app to get alerts' : 'Get trade offers on your phone'}</p>
        <p className="text-xs text-gray-300">{mode === 'install' ? 'On an iPhone, alerts only work once the app is on your home screen.' : 'An alert when someone sends you an offer, even with the site closed.'}</p>
        {msg && <p role="status" className="text-xs text-yellow-200 mt-1">{msg}</p>}
      </div>
      <div className="flex gap-2 shrink-0">
        {mode === 'install'
          ? <Link href="/install" className="rounded-xl bg-yellow-500 hover:bg-yellow-400 px-3 py-1.5 text-sm font-bold text-gray-950">Install the app</Link>
          : <button type="button" disabled={busy} onClick={turnOn} className="rounded-xl bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 px-3 py-1.5 text-sm font-bold text-gray-950">Turn on alerts</button>}
        <button type="button" onClick={notNow} className="rounded-xl border border-gray-600 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:text-white">Not now</button>
      </div>
    </aside>
  );
}
