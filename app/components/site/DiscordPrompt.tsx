'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { CHANNEL_NAME } from '@/lib/site';
import { MAX_DISMISSALS, dismissed, parsePromptState } from '@/lib/push-prompt-core';

const KEY = 'tcg_discord_prompt';

/**
 * A banner for signed-in viewers who have not linked Discord: "Get alerts in your Discord DMs". Shown only while Discord linking
 * is set up on the server. "Not now" snoozes it the same way as the push banner (14 days, stops after three). Renders nothing
 * when signed out (the API answers 401) or once linked.
 */
export function DiscordPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch('/api/account/discord', { cache: 'no-store' });
        const info = r.ok ? await r.json() as { enabled?: boolean; linked?: unknown } : null;
        if (!info?.enabled || info.linked) return;
        let state;
        try { state = parsePromptState(localStorage.getItem(KEY)); } catch { state = parsePromptState(null); }
        if (live && state.n < MAX_DISMISSALS && Date.now() >= state.until) setShow(true);
      } catch { /* no banner */ }
    })();
    return () => { live = false; };
  }, []);

  if (!show) return null;

  const notNow = () => {
    try { localStorage.setItem(KEY, JSON.stringify(dismissed(parsePromptState(localStorage.getItem(KEY)), Date.now()))); } catch { /* storage unavailable: it just comes back next visit */ }
    setShow(false);
  };

  return (
    <aside aria-label="Discord alerts" className="rounded-2xl border border-indigo-400/40 bg-indigo-500/10 p-4 flex flex-wrap items-center gap-3">
      <Icon name="chat" className="w-6 h-6 text-indigo-300 shrink-0" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-bold text-white">Get alerts in your Discord DMs</p>
        <p className="text-xs text-gray-300">Link Discord and the Cheesy TCG bot messages you about trade offers and more. You need to be in the {CHANNEL_NAME} Discord server.</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <a href="/auth/discord" className="rounded-xl bg-indigo-500 hover:bg-indigo-400 px-3 py-1.5 text-sm font-bold text-white inline-flex items-center gap-1.5"><Icon name="link" />Link Discord</a>
        <button type="button" onClick={notNow} className="rounded-xl border border-gray-600 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:text-white">Not now</button>
      </div>
    </aside>
  );
}
