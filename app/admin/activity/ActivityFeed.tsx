'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ActivityEvent } from '@/lib/activity';
import { cardThumbUrl } from '@/lib/card-art';
import { getRarity } from '@/lib/rarity';
import { VARIANT_LABELS } from '@/lib/variants';
import { Avatar } from '@/app/components/Avatar';

export type CardInfo = { packName: string; number: number; name: string; imageUrl: string; stars: number };

type Status = 'live' | 'paused' | 'reconnecting' | 'signed-out';
type Filter = 'all' | 'pulls' | 'cards' | 'stream' | 'resets';

const POLL_MS = 3000;
const MAX_EVENTS = 300;

const FILTERS: { id: Filter; label: string; match: (e: ActivityEvent) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'pulls', label: 'Pulls', match: e => e.type === 'pull' },
  { id: 'cards', label: 'Grants & removals', match: e => e.type === 'grant' || e.type === 'remove' || e.type === 'upgrade' },
  { id: 'stream', label: 'Stream', match: e => e.type === 'trigger' || e.type === 'collection_shown' },
  { id: 'resets', label: 'Resets', match: e => e.type === 'reset' || e.type === 'delete' },
];

function timeAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(at).toLocaleDateString();
}

export function ActivityFeed({
  initialEvents,
  initialSeq,
  initialAvatars,
  cards,
}: {
  initialEvents: ActivityEvent[];
  initialSeq: number;
  initialAvatars: Record<string, string>;
  cards: CardInfo[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const [avatars, setAvatars] = useState(initialAvatars);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<Status>('live');
  const [filter, setFilter] = useState<Filter>('all');
  const [now, setNow] = useState(() => Date.now());
  const seqRef = useRef(initialSeq);
  const seenRef = useRef(new Set(initialEvents.map(e => e.seq)));

  // Card lookup: exact pack+number first, falling back to number alone.
  const cardIndex = useMemo(() => {
    const exact = new Map<string, CardInfo>();
    const byNumber = new Map<number, CardInfo>();
    for (const c of cards) {
      exact.set(`${c.packName}#${c.number}`, c);
      if (!byNumber.has(c.number)) byNumber.set(c.number, c);
    }
    return (number: number, packName?: string) => (packName && exact.get(`${packName}#${number}`)) || byNumber.get(number);
  }, [cards]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const poll = useCallback(async (retried = false): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/activity?after=${seqRef.current}`, { cache: 'no-store' });
      if (res.status === 401) { setStatus('signed-out'); return; }
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json() as { events: ActivityEvent[]; seq: number; avatars: Record<string, string> };

      // Counter went backwards (e.g. KV was cleared): start over from the latest events.
      if (data.seq < seqRef.current && !retried) {
        seqRef.current = 0;
        seenRef.current = new Set();
        setEvents([]);
        return poll(true);
      }
      seqRef.current = Math.max(seqRef.current, data.seq);

      const added = data.events.filter(e => !seenRef.current.has(e.seq));
      if (added.length > 0) {
        added.forEach(e => seenRef.current.add(e.seq));
        const addedSeqs = added.map(e => e.seq);
        setAvatars(prev => ({ ...prev, ...data.avatars }));
        setEvents(prev => [...added, ...prev].slice(0, MAX_EVENTS));
        setFresh(f => new Set([...f, ...addedSeqs]));
        setTimeout(() => setFresh(f => { const n = new Set(f); addedSeqs.forEach(q => n.delete(q)); return n; }), 2500);
      }
      setStatus('live');
    } catch {
      setStatus('reconnecting');
    }
  }, []);

  useEffect(() => {
    if (paused) { setStatus('paused'); return; }
    if (status === 'signed-out') return;
    const tick = () => { if (document.visibilityState === 'visible') poll(); };
    const interval = setInterval(tick, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);
    poll();
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, poll]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map(f => [f.id, events.filter(f.match).length])) as Record<Filter, number>,
    [events],
  );
  const visible = events.filter(FILTERS.find(f => f.id === filter)!.match);
  const totalCards = cards.length;

  return (
    <div className="space-y-4">
      {/* Status + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                filter === f.id
                  ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300'
                  : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {f.label} <span className="text-gray-500 tabular-nums">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={status} />
          <button
            onClick={() => setPaused(p => !p)}
            className="px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          >
            {paused ? '▶ Resume' : '❚❚ Pause'}
          </button>
        </div>
      </div>

      {status === 'signed-out' && (
        <div className="tcg-panel rounded-xl p-4 text-sm text-red-300 border-red-500/30">
          Your session expired, so the feed stopped updating. <a href="/login" className="underline">Log in again</a>.
        </div>
      )}

      {/* Feed */}
      <div className="tcg-panel rounded-2xl overflow-hidden">
        {visible.length === 0 ? (
          <div className="px-6 py-16 text-center space-y-1">
            <p className="text-gray-400 font-semibold">{events.length === 0 ? 'No activity yet' : 'Nothing matches this filter'}</p>
            {events.length === 0 && <p className="text-sm text-gray-600">Pulls and other actions will appear here the moment they happen.</p>}
          </div>
        ) : (
          <ul className="divide-y divide-gray-800/60">
            {visible.map(e => (
              <li key={e.seq} className={fresh.has(e.seq) ? 'activity-fresh' : undefined}>
                <EventRow event={e} now={now} avatar={avatars[e.username]} cardIndex={cardIndex} totalCards={totalCards} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {events.length >= MAX_EVENTS && <p className="text-center text-xs text-gray-600">Showing the latest {MAX_EVENTS} events</p>}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const cfg = {
    live: { dot: 'bg-green-400 animate-pulse', text: 'text-green-300', label: 'Live' },
    paused: { dot: 'bg-gray-500', text: 'text-gray-400', label: 'Paused' },
    reconnecting: { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300', label: 'Reconnecting…' },
    'signed-out': { dot: 'bg-red-400', text: 'text-red-300', label: 'Signed out' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider ${cfg.text}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function UserLink({ username }: { username: string }) {
  return (
    <Link href={`/admin/users/${encodeURIComponent(username)}`} className="font-bold text-white hover:text-yellow-300 transition-colors">
      {username}
    </Link>
  );
}

function CardThumb({ card, stars }: { card?: CardInfo; stars: number }) {
  const rarity = getRarity(card?.stars ?? stars);
  return (
    <div
      className="w-10 h-[60px] rounded-md overflow-hidden bg-gray-800 border-2 shrink-0"
      style={{ borderColor: rarity?.hex ?? '#434f7b' }}
    >
      {card?.imageUrl && <img src={cardThumbUrl(card.imageUrl)} alt="" loading="lazy" className="w-full h-full object-cover" />}
    </div>
  );
}

function Stars({ n }: { n: number }) {
  const r = getRarity(n);
  return <span className={`${r?.text ?? 'text-gray-400'} font-bold`}>{'★'.repeat(n)}</span>;
}

function EventRow({
  event: e,
  now,
  avatar,
  cardIndex,
  totalCards,
}: {
  event: ActivityEvent;
  now: number;
  avatar?: string;
  cardIndex: (n: number, packName?: string) => CardInfo | undefined;
  totalCards: number;
}) {
  let icon: string;
  let accent = 'border-l-transparent';
  let body: ReactNode;
  let sub: ReactNode = null;
  let thumb: ReactNode = null;

  switch (e.type) {
    case 'pull': {
      const card = cardIndex(e.cardNumber, e.packName);
      icon = '🎴';
      accent = e.isNew ? 'border-l-yellow-400' : 'border-l-gray-700';
      thumb = <CardThumb card={card} stars={e.stars} />;
      body = (
        <>
          <UserLink username={e.username} /> pulled <span className="font-bold text-white">{e.cardName || card?.name || `#${e.cardNumber}`}</span>{' '}
          <Stars n={e.stars} />
          {e.variant && e.variant !== 'regular' && (
            <span className="ml-2 text-[10px] font-extrabold uppercase tracking-wider text-fuchsia-300 border border-fuchsia-500/50 rounded-full px-2 py-0.5">{VARIANT_LABELS[e.variant]}</span>
          )}
          {e.isNew ? (
            <span className="ml-2 text-[10px] font-extrabold uppercase tracking-wider text-gray-950 bg-yellow-400 rounded-full px-2 py-0.5">New</span>
          ) : (
            <span className="ml-2 text-[10px] font-extrabold uppercase tracking-wider text-yellow-300 border border-yellow-500/50 rounded-full px-2 py-0.5">×{e.copies}</span>
          )}
        </>
      );
      sub = `${e.packName}${totalCards > 0 ? ` · ${e.uniqueOwned}/${totalCards} collected` : ''}`;
      break;
    }
    case 'grant': {
      const card = cardIndex(e.cardNumber);
      icon = '🎁';
      accent = 'border-l-green-400';
      thumb = <CardThumb card={card} stars={card?.stars ?? 1} />;
      body = (
        <>
          <span className="font-bold text-white">{card?.name ?? `Card #${e.cardNumber}`}</span> granted to <UserLink username={e.username} />
        </>
      );
      sub = e.source === 'webhook' ? 'via webhook' : 'by admin';
      break;
    }
    case 'remove': {
      const card = cardIndex(e.cardNumber);
      icon = '🗑️';
      accent = 'border-l-red-400';
      thumb = <CardThumb card={card} stars={card?.stars ?? 1} />;
      body = (
        <>
          <span className="font-bold text-white">{card?.name ?? `Card #${e.cardNumber}`}</span> removed from <UserLink username={e.username} />
        </>
      );
      sub = 'by admin';
      break;
    }
    case 'upgrade': {
      const card = cardIndex(e.cardNumber);
      icon = '✨';
      accent = 'border-l-yellow-400';
      thumb = <CardThumb card={card} stars={card?.stars ?? 1} />;
      body = (
        <>
          <UserLink username={e.username} /> upgraded <span className="font-bold text-white">{e.cardName || card?.name || `#${e.cardNumber}`}</span> to <span className="font-bold text-yellow-300">{VARIANT_LABELS[e.to]}</span>
        </>
      );
      sub = `${e.cost}× ${VARIANT_LABELS[e.from]} spent`;
      break;
    }
    case 'reset':
      icon = '🔄';
      accent = 'border-l-red-400';
      body = e.scope === 'everyone'
        ? <>All collections were reset</>
        : <><UserLink username={e.username} />&apos;s collection was reset{e.scope === 'all' ? ' across all seasons' : ''}</>;
      break;
    case 'delete':
      icon = '❌';
      accent = 'border-l-red-400';
      body = <><UserLink username={e.username} /> was deleted</>;
      break;
    case 'trigger':
      icon = e.kind === 'pull' ? (e.source === 'admin' ? '🎁' : '⚡') : '📖';
      accent = 'border-l-poke-blue-light';
      body = e.source === 'admin' && e.kind === 'pull' ? (
        <>{(e.count ?? 1) > 1 ? `${e.count} packs` : 'A pack'} gifted to <UserLink username={e.username} /></>
      ) : (
        <><UserLink username={e.username} /> triggered {e.kind === 'pull' ? 'a pack draw' : 'a collection view'}</>
      );
      sub = e.source === 'admin' ? 'by admin' : 'via webhook';
      break;
    case 'collection_shown':
      icon = '📺';
      accent = 'border-l-poke-blue-light';
      body = <><UserLink username={e.username} />&apos;s collection was shown on stream</>;
      break;
  }

  return (
    <div className={`flex items-center gap-4 px-5 py-3 border-l-4 ${accent} hover:bg-white/[0.02] transition-colors`}>
      {e.username ? (
        <Avatar src={avatar} name={e.username} className="w-9 h-9 text-sm" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-base shrink-0">{icon}</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-300 leading-snug">
          <span className="mr-1.5" aria-hidden>{icon}</span>
          {body}
        </p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
      {thumb}
      <time className="text-xs text-gray-500 tabular-nums shrink-0 w-16 text-right" dateTime={new Date(e.at).toISOString()} title={new Date(e.at).toLocaleString()}>
        {timeAgo(e.at, now)}
      </time>
    </div>
  );
}
