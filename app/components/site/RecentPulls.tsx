'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { agoShort, notableReason, type PullItem } from '@/lib/home-data';
import { VARIANT_LABELS } from '@/lib/variants';
import { SerialChip } from '@/app/components/SerialChip';
import { profileHref } from '@/lib/profile-url';
import type { ReactNode } from 'react';

const POLL_MS = 45_000;

/** The home page's recent pulls. Starts from the server-rendered list and refreshes itself while the tab is visible. */
export function RecentPulls({ initial, empty }: { initial: PullItem[]; empty: ReactNode }) {
  const [items, setItems] = useState(initial);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/recent-pulls', { cache: 'no-store' });
        if (res.ok && !stopped) { const data = await res.json(); setItems(data.items ?? []); setNow(Date.now()); }
      } catch { /* keep what is shown */ }
    };
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 30_000); // keep "3m ago" honest between refreshes
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; clearInterval(poll); clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  if (items.length === 0) return <>{empty}</>;
  return (
    <ul className="rind rounded-2xl divide-y divide-gray-800/70 overflow-hidden" aria-live="polite">
      {items.map(e => {
        const why = notableReason(e);
        return (
          <li key={e.seq} className={`px-4 py-2.5 flex items-center gap-3 ${why ? 'bg-yellow-500/[0.06]' : ''}`}>
            {e.thumb ? (
              <img src={e.thumb} alt="" loading="lazy" className="w-8 h-11 object-cover rounded" style={{ boxShadow: `0 0 0 1.5px ${e.hex}` }} />
            ) : (
              <span className="w-8 h-11 rounded bg-gray-800" />
            )}
            <span className="flex-1 min-w-0 text-sm">
              <Link href={profileHref(e.username)} className="font-semibold text-white hover:text-yellow-300">{e.username}</Link>{' '}
              <span className="text-gray-400">pulled</span>{' '}
              <Link href={`/cards?card=${e.cardNumber}`} className="font-semibold hover:underline" style={{ color: e.hex }}>{e.cardName || `#${e.cardNumber}`}</Link>
              {e.variant && e.variant !== 'regular' && (
                <span className="ml-1.5 text-[10px] font-extrabold uppercase tracking-wider text-fuchsia-300 border border-fuchsia-500/40 rounded-full px-1.5 py-0.5">{VARIANT_LABELS[e.variant]}</span>
              )}
              {why && !(e.variant && e.variant !== 'regular' && why !== '5★') && (
                <span className="ml-1.5 text-[10px] font-extrabold uppercase tracking-wider text-yellow-300 border border-yellow-500/40 rounded-full px-1.5 py-0.5">{why}</span>
              )}
            </span>
            {e.serial ? <SerialChip n={e.serial} bonus={e.bonus} /> : null}
            <span className="text-xs text-gray-600 shrink-0">{agoShort(e.at, now)}</span>
          </li>
        );
      })}
    </ul>
  );
}
