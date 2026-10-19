'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { NOTICE_ICON, type Notice } from '@/lib/trade-notice-core';
import { NOTICE_FILTERS, groupByDay, matchesFilter, timeLabel, type NoticeFilter } from '@/lib/notice-list-core';

export function NoticeList({ initial, initialSeen }: { initial: Notice[]; initialSeen: number }) {
  const [seen, setSeen] = useState(initialSeen);
  // Days and times are in the viewer's own time zone, which the server does not know: draw the list once mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [filter, setFilter] = useState<NoticeFilter>('all');
  const unread = initial.filter(n => n.at > seen).length;
  const groups = useMemo(() => !mounted ? [] : groupByDay(initial.filter(n => matchesFilter(n, filter, seen))), [initial, filter, seen, mounted]);

  function markAll() {
    setSeen(Date.now());
    fetch('/api/notifications', { method: 'POST' }).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter notifications">
          {NOTICE_FILTERS.map(f => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${filter === f.id ? 'border-yellow-500 bg-yellow-500/15 text-yellow-300' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
              {f.label}{f.id === 'unread' && unread > 0 ? ` (${unread})` : ''}
            </button>
          ))}
        </div>
        <button type="button" onClick={markAll} disabled={unread === 0} className="text-xs font-semibold text-yellow-400 hover:text-yellow-300 disabled:text-gray-600 disabled:hover:text-gray-600">Mark all read</button>
      </div>
      {groups.length === 0 ? (
        <p className="card rounded-2xl px-4 py-10 text-center text-sm text-gray-500">{!mounted ? 'Loading...' : initial.length === 0 ? 'Nothing yet. Trade offers and their results show up here.' : 'No notices match this filter.'}</p>
      ) : groups.map(g => (
        <section key={g.label} className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">{g.label}</h2>
          <ul className="card rounded-2xl divide-y divide-gray-800/70 overflow-hidden">
            {g.items.map(n => (
              <li key={n.id} className={`px-4 py-3 flex gap-3 ${n.at > seen ? 'bg-yellow-500/6' : ''}`}>
                <Icon name={NOTICE_ICON[n.kind]} className="w-5 h-5 mt-0.5 shrink-0 text-yellow-400/90" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-gray-200 wrap-break-word">{n.text}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
                    <span>{timeLabel(n.at)}</span>
                    {n.kind === 'feedback' && <Link href="/feedback" className="font-semibold text-yellow-400 hover:text-yellow-300">See your feedback</Link>}
                    {n.kind === 'watch' && <Link href="/trade?tab=board" className="font-semibold text-yellow-400 hover:text-yellow-300">See the listing</Link>}
                    {(n.kind === 'offer' || n.kind === 'countered') && <Link href="/trade" className="font-semibold text-yellow-400 hover:text-yellow-300">View offer</Link>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
