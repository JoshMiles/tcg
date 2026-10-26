'use client';
import { Icon, type IconName } from '@/app/components/Icon';
import { SerialChip } from '@/app/components/SerialChip';
import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ActivityEvent } from '@/lib/activity';
import { cardThumbUrl } from '@/lib/card-art';
import { getRarity } from '@/lib/rarity';
import { VARIANT_LABELS } from '@/lib/variants';
import { Avatar } from '@/app/components/Avatar';
import { CATEGORIES, cardNumberOf, categoryOf, groupEvents, notableReason, plainText, pullFacts, rateStats, toCsv, type Category, type Group } from '@/lib/activity-view';
import { EventDetail } from './EventDetail';
import { PrintLink, PrintSeasons } from './PrintLink';
import { SummaryStrip } from './SummaryStrip';

export type CardInfo = { packName: string; number: number; name: string; imageUrl: string; stars: number };

type Status = 'live' | 'paused' | 'reconnecting' | 'signed-out';

const POLL_MS = 3000;
const IDLE_MS = 10 * 60 * 1000; // no input for this long: the feed stops polling until the viewer is back
const MAX_EVENTS = 300;
const PREFS_KEY = 'tcg_activity_prefs';
const VARIANT_IDS = ['regular', 'reverse', 'full', 'shiny'] as const;

interface Prefs {
  categories: Category[];
  variants: string[];
  stars: number[];
  pack: string;
  newOnly: boolean;
  compact: boolean;
  group: boolean;
  pinNotable: boolean;
  sound: boolean;
  desktop: boolean;
}
const DEFAULT_PREFS: Prefs = { categories: [], variants: [], stars: [], pack: '', newOnly: false, compact: false, group: true, pinNotable: true, sound: false, desktop: false };

function loadPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return DEFAULT_PREFS; }
}

function timeAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(at).toLocaleDateString('en-GB', { timeZone: 'UTC' }); // a fixed locale: the server and the browser must print the same text
}

/** A short two-note chime made with WebAudio, so there is no sound file to ship. */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.14 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.14);
      osc.stop(ctx.currentTime + i * 0.14 + 0.32);
    });
    setTimeout(() => ctx.close(), 900);
  } catch { /* audio unavailable */ }
}

const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${on ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300' : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:text-white'}`;
/** Where viewer links point: the admin's user page, or the mod panel's for mods. */
const PanelBase = createContext('/admin');

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

export function ActivityFeed({
  initialEvents,
  initialSeq,
  initialAvatars,
  cards,
  seasons = {},
  mod = false,
  serverNow,
}: {
  initialEvents: ActivityEvent[];
  initialSeq: number;
  initialAvatars: Record<string, string>;
  cards: CardInfo[];
  /** Collection name -> season id, to link an event to its print. */
  seasons?: Record<string, string>;
  /** The mod panel's read-only version: no gifting, granting or removing, and viewer links go to the mod panel. */
  mod?: boolean;
  /** The server's clock when the page was rendered. The first client render uses it too, so the relative times ("5m ago", the last-hour counts) match the server's HTML and hydration does not mismatch when a minute turns in between. */
  serverNow?: number;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [avatars, setAvatars] = useState(initialAvatars);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [paused, setPaused] = useState(false);
  const [idle, setIdle] = useState(false);
  const [status, setStatus] = useState<Status>('live');
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [viewer, setViewer] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [open, setOpen] = useState<ActivityEvent | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => serverNow ?? Date.now());
  const seqRef = useRef(initialSeq);
  const lastInputRef = useRef(Date.now());
  const seenRef = useRef(new Set(initialEvents.map(e => e.seq)));
  const prefsRef = useRef(prefs);

  useEffect(() => { const p = loadPrefs(); setPrefs(p); setPrefsLoaded(true); }, []);
  useEffect(() => {
    prefsRef.current = prefs;
    if (!prefsLoaded) return;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
  }, [prefs, prefsLoaded]);
  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs(p => ({ ...p, [k]: v }));

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
  const cardName = useCallback((n: number, pack?: string) => cardIndex(n, pack)?.name, [cardIndex]);
  const totalCards = cards.length;
  const packNames = useMemo(() => [...new Set(cards.map(c => c.packName))], [cards]);

  useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); if (Date.now() - lastInputRef.current >= IDLE_MS) setIdle(true); }, 5000);
    return () => clearInterval(t);
  }, []);

  // Any input counts as being back: it resumes a feed that went idle.
  useEffect(() => {
    const back = () => { lastInputRef.current = Date.now(); setIdle(false); };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach(e => window.addEventListener(e, back, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, back));
  }, []);

  // Alerts for notable moments (sound / desktop notification), for events that arrive while the page is open.
  const alertFor = useCallback((added: ActivityEvent[]) => {
    const p = prefsRef.current;
    if (!p.sound && !p.desktop) return;
    const hit = added.find(e => notableReason(e, totalCards));
    if (!hit) return;
    if (p.sound) chime();
    if (p.desktop && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification(notableReason(hit, totalCards) ?? 'Activity', { body: plainText(hit, cardName), tag: 'tcg-activity' }); } catch { /* blocked */ }
    }
  }, [totalCards, cardName]);

  const poll = useCallback(async (retried = false): Promise<void> => {
    try {
      let res = await fetch(`/api/admin/activity?after=${seqRef.current}`, { cache: 'no-store' });
      if (res.status === 401) {
        // The staff cookie ran out: renew it from the viewer session and retry once before giving up.
        const renewed = await fetch('/auth/staff?silent=1', { cache: 'no-store' }).then(r => r.ok).catch(() => false);
        if (renewed) res = await fetch(`/api/admin/activity?after=${seqRef.current}`, { cache: 'no-store' });
        if (!renewed || res.status === 401) { setStatus('signed-out'); return; }
      }
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
        alertFor(added);
      }
      setStatus('live');
    } catch {
      setStatus('reconnecting');
    }
  }, [alertFor]);

  useEffect(() => {
    if (paused || idle) { setStatus('paused'); return; }
    if (status === 'signed-out') return;
    const tick = () => { if (document.visibilityState === 'visible') poll(); };
    const interval = setInterval(tick, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);
    poll();
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, idle, poll]);

  // Filtering
  const needle = search.trim().toLowerCase();
  const matches = useCallback((e: ActivityEvent) => {
    if (prefs.categories.length > 0 && !prefs.categories.includes(categoryOf(e))) return false;
    if (viewer && e.username !== viewer) return false;
    if (prefs.newOnly && !pullFacts(e)?.isNew) return false;
    if (prefs.variants.length > 0) {
      const v = pullFacts(e)?.variant ?? (e.type === 'upgrade' ? e.to : null);
      if (!v || !prefs.variants.includes(v)) return false;
    }
    if (prefs.stars.length > 0) {
      const stars = e.type === 'pull' ? e.stars : e.type === 'grant' && e.stars !== undefined ? e.stars : cardNumberOf(e) !== undefined ? cardIndex(cardNumberOf(e)!)?.stars : undefined;
      if (stars === undefined || !prefs.stars.includes(stars)) return false;
    }
    if (prefs.pack) {
      const pack = e.type === 'pull' ? e.packName : e.type === 'grant' && e.packName ? e.packName : cardNumberOf(e) !== undefined ? cardIndex(cardNumberOf(e)!)?.packName : undefined;
      if (pack !== prefs.pack) return false;
    }
    if (needle && !plainText(e, cardName).toLowerCase().includes(needle)) return false;
    return true;
  }, [prefs, viewer, needle, cardIndex, cardName]);

  const visible = useMemo(() => events.filter(matches), [events, matches]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(CATEGORIES.map(x => [x.id, 0])) as Record<Category, number>;
    for (const e of events) c[categoryOf(e)]++;
    return c;
  }, [events]);
  const groups: Group[] = useMemo(() => (prefs.group ? groupEvents(visible) : visible.map(e => ({ key: String(e.seq), events: [e] }))), [visible, prefs.group]);
  const rates = useMemo(() => rateStats(events, now), [events, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const notable = useMemo(() => events.filter(e => notableReason(e, totalCards)).slice(0, 5), [events, totalCards]);
  const activeFilters = prefs.categories.length + prefs.variants.length + prefs.stars.length + (prefs.pack ? 1 : 0) + (prefs.newOnly ? 1 : 0) + (viewer ? 1 : 0) + (needle ? 1 : 0);

  const clearFilters = () => { setPrefs(p => ({ ...p, categories: [], variants: [], stars: [], pack: '', newOnly: false })); setSearch(''); setViewer(''); };
  const download = (kind: 'csv' | 'json') => {
    const body = kind === 'csv' ? toCsv(visible, cardName) : JSON.stringify(visible, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: kind === 'csv' ? 'text/csv' : 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const enableDesktop = async () => {
    if (prefs.desktop) { setPref('desktop', false); return; }
    if (typeof Notification === 'undefined') return;
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPref('desktop', perm === 'granted');
  };
  const filterRare = () => setPrefs(p => ({ ...p, categories: ['pulls'], variants: ['full', 'shiny'], stars: [] }));

  return (
    <PanelBase.Provider value={mod ? '/mod' : '/admin'}>
    <PrintSeasons.Provider value={seasons}>
    <div className="space-y-4">
      <SummaryStrip rates={rates} onFilterRare={filterRare} />

      {/* Search + status + controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56 max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"><Icon name="search" /></span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search viewers, cards, packs…"
            aria-label="Search activity"
            className="input w-full pl-9"
          />
        </div>
        {viewer && (
          <button type="button" onClick={() => setViewer('')} className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/50 bg-yellow-500/10 px-3 py-1.5 text-xs font-bold text-yellow-300" title="Stop filtering by this viewer">
            <Icon name="user" />{viewer}<Icon name="x" className="w-3 h-3" />
          </button>
        )}
        <button type="button" onClick={() => setShowMore(s => !s)} aria-expanded={showMore} className={chip(showMore || prefs.variants.length + prefs.stars.length > 0 || !!prefs.pack || prefs.newOnly)}>
          <Icon name="filter" className="mr-1" />More filters
        </button>
        {activeFilters > 0 && <button type="button" onClick={clearFilters} className="text-xs font-semibold text-gray-400 hover:text-white underline underline-offset-2">Clear all</button>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <StatusPill status={paused || idle ? 'paused' : status} />
          {idle && (
            <button type="button" onClick={() => { lastInputRef.current = Date.now(); setIdle(false); }} className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/50 bg-yellow-500/10 px-3 py-1.5 text-xs font-bold text-yellow-300" title="No input for 10 minutes, so the feed stopped checking for new activity. Any click or key resumes it.">
              <Icon name="play" />Idle, resume
            </button>
          )}
          <button onClick={() => setPaused(p => !p)} className="px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
            {paused ? <><Icon name="play" className="mr-1" />Resume</> : <><Icon name="pause" className="mr-1" />Pause</>}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setPref('categories', [])} className={chip(prefs.categories.length === 0)}>All <span className="text-gray-500 tabular-nums">{events.length}</span></button>
        {CATEGORIES.map(c => (
          <button key={c.id} type="button" onClick={() => setPrefs(p => ({ ...p, categories: toggle(p.categories, c.id) }))} aria-pressed={prefs.categories.includes(c.id)} className={chip(prefs.categories.includes(c.id))}>
            {c.label} <span className="text-gray-500 tabular-nums">{counts[c.id]}</span>
          </button>
        ))}
      </div>

      {showMore && (
        <div className="dash-slide rounded-xl border border-gray-800 bg-gray-900/70 p-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">Rarity</p>
            <div className="flex flex-wrap gap-1.5">{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" onClick={() => setPrefs(p => ({ ...p, stars: toggle(p.stars, n) }))} aria-pressed={prefs.stars.includes(n)} className={chip(prefs.stars.includes(n))}>{'★'.repeat(n)}</button>)}</div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">Version</p>
            <div className="flex flex-wrap gap-1.5">{VARIANT_IDS.map(v => <button key={v} type="button" onClick={() => setPrefs(p => ({ ...p, variants: toggle(p.variants, v) }))} aria-pressed={prefs.variants.includes(v)} className={chip(prefs.variants.includes(v))}>{VARIANT_LABELS[v]}</button>)}</div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">Pack</p>
            <select value={prefs.pack} onChange={e => setPref('pack', e.target.value)} aria-label="Pack" className="select select-sm w-full">
              <option value="">Any pack</option>
              {packNames.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">Other</p>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer"><input type="checkbox" role="switch" checked={prefs.newOnly} onChange={e => setPref('newOnly', e.target.checked)} className="toggle toggle-sm toggle-primary" />Only new cards</label>
          </div>
        </div>
      )}

      {/* View, alerts and export */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => setPref('compact', !prefs.compact)} className={chip(prefs.compact)}><Icon name="list" className="mr-1" />Compact</button>
        <button type="button" onClick={() => setPref('group', !prefs.group)} className={chip(prefs.group)} title="Collapse quick bursts, like a multi-pack opening, into one row">Group bursts</button>
        <button type="button" onClick={() => setPref('pinNotable', !prefs.pinNotable)} className={chip(prefs.pinNotable)}><Icon name="pin" className="mr-1" />Pin notable</button>
        <span className="mx-1 h-4 w-px bg-gray-800" aria-hidden />
        <button type="button" onClick={() => { const next = !prefs.sound; setPref('sound', next); if (next) chime(); }} className={chip(prefs.sound)} title="Play a chime when something notable happens"><Icon name={prefs.sound ? 'bell' : 'bellOff'} className="mr-1" />Sound</button>
        <button type="button" onClick={enableDesktop} className={chip(prefs.desktop)} title="Show a desktop notification when something notable happens"><Icon name="monitor" className="mr-1" />Desktop alerts</button>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-gray-600">Export {visible.length} shown</span>
          <button type="button" onClick={() => download('csv')} disabled={visible.length === 0} className={chip(false)}><Icon name="download" className="mr-1" />CSV</button>
          <button type="button" onClick={() => download('json')} disabled={visible.length === 0} className={chip(false)}>JSON</button>
        </span>
      </div>

      {status === 'signed-out' && (
        <div className="card rounded-xl p-4 text-sm text-red-300 border-red-500/30">
          Signed out, so the feed stopped updating.{' '}
          <a href="/auth/staff?returnTo=/admin/activity" className="inline-block rounded-md bg-red-500/20 px-2.5 py-1 font-semibold underline">Sign in again</a>
        </div>
      )}

      {/* Pinned notable moments */}
      {prefs.pinNotable && notable.length > 0 && (
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/4 overflow-hidden">
          <p className="px-5 py-2 text-[11px] uppercase tracking-wider font-bold text-yellow-400 border-b border-yellow-500/20"><Icon name="pin" className="mr-1.5" />Notable moments</p>
          <ul className="divide-y divide-yellow-500/10">
            {notable.map(e => (
              <li key={e.seq}>
                <button type="button" onClick={() => setOpen(e)} className="w-full flex items-center gap-3 px-5 py-2 text-left text-sm hover:bg-white/3">
                  <Icon name="sparkles" className="text-yellow-400" />
                  <span className="min-w-0 flex-1 truncate text-gray-200">{plainText(e, cardName)}</span>
                  <span className="text-[11px] font-semibold text-yellow-300 shrink-0">{notableReason(e, totalCards)}</span>
                  <span className="text-xs text-gray-500 shrink-0 w-14 text-right">{timeAgo(e.at, now)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Feed */}
      <div className="card rounded-2xl overflow-hidden">
        {groups.length === 0 ? (
          <div className="px-6 py-16 text-center space-y-1">
            <p className="text-gray-400 font-semibold">{events.length === 0 ? 'No activity yet' : 'Nothing matches these filters'}</p>
            {events.length === 0
              ? <p className="text-sm text-gray-600">Pulls and other actions will appear here the moment they happen.</p>
              : <button type="button" onClick={clearFilters} className="text-sm text-yellow-400 hover:text-yellow-300 underline underline-offset-2">Clear filters</button>}
          </div>
        ) : (
          <ul className="divide-y divide-gray-800/60">
            {groups.map(g => {
              const lead = g.events[0];
              const many = g.events.length > 1;
              const isOpen = expanded.has(g.key);
              return (
                <li key={g.key} className={fresh.has(lead.seq) ? 'activity-fresh' : undefined}>
                  {many && (
                    <GroupHeader group={g} now={now} open={isOpen} avatar={avatars[lead.username]} cardIndex={cardIndex} onToggle={() => setExpanded(s => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })} />
                  )}
                  {(!many || isOpen) && g.events.map(e => (
                    <div key={e.seq} className={many ? 'bg-gray-950/30 pl-6' : ''}>
                      <EventRow event={e} now={now} avatar={avatars[e.username]} cardIndex={cardIndex} totalCards={totalCards} compact={prefs.compact} reason={notableReason(e, totalCards)} onOpen={() => setOpen(e)} onFilterViewer={() => setViewer(e.username)} />
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {events.length >= MAX_EVENTS && <p className="text-center text-xs text-gray-600">Showing the latest {MAX_EVENTS} events. Export keeps what is shown.</p>}

      {open && (
        <EventDetail
          event={open}
          avatar={avatars[open.username]}
          card={cardNumberOf(open) !== undefined ? cardIndex(cardNumberOf(open)!, open.type === 'pull' ? open.packName : undefined) : undefined}
          totalCards={totalCards}
          cardName={cardName}
          onClose={() => setOpen(null)}
          onFilterViewer={setViewer}
          mod={mod}
        />
      )}
    </div>
    </PrintSeasons.Provider>
    </PanelBase.Provider>
  );
}

/** The summary row of a burst: who, how many, and a strip of what they got. */
function GroupHeader({ group, now, open, avatar, cardIndex, onToggle }: {
  group: Group; now: number; open: boolean; avatar?: string; cardIndex: (n: number, p?: string) => CardInfo | undefined; onToggle: () => void;
}) {
  const lead = group.events[0];
  const isPull = lead.type === 'pull';
  const label = isPull ? `pulled ${group.events.length} cards` : `was gifted ${group.events.reduce((n, e) => n + (e.type === 'trigger' ? e.count ?? 1 : 0), 0)} packs`;
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex items-center gap-4 px-5 py-3 border-l-4 border-l-yellow-500/60 text-left hover:bg-white/2">
      <Avatar src={avatar} name={lead.username} className="w-9 h-9 text-sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-300"><strong className="text-white">{lead.username}</strong> {label}<span className="ml-2 text-[10px] font-extrabold uppercase tracking-wider text-gray-950 bg-yellow-400 rounded-full px-2 py-0.5">burst</span></p>
        {isPull && (
          <div className="mt-1.5 flex gap-1">
            {group.events.slice(0, 8).map(e => e.type === 'pull' && (
              <span key={e.seq} className="w-6 h-9 rounded-xs overflow-hidden bg-gray-800 border" style={{ borderColor: getRarity(e.stars)?.hex ?? '#434f7b' }}>
                {cardIndex(e.cardNumber, e.packName)?.imageUrl && <img src={cardThumbUrl(cardIndex(e.cardNumber, e.packName)!.imageUrl)} alt="" className="w-full h-full object-cover" />}
              </span>
            ))}
            {group.events.length > 8 && <span className="self-center text-xs text-gray-500">+{group.events.length - 8}</span>}
          </div>
        )}
      </div>
      <Icon name={open ? 'chevronUp' : 'chevronDown'} className="text-gray-500" />
      <time className="text-xs text-gray-500 tabular-nums shrink-0 w-16 text-right">{timeAgo(lead.at, now)}</time>
    </button>
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
  const base = useContext(PanelBase);
  return (
    <Link href={`${base}/users/${encodeURIComponent(username)}`} onClick={e => e.stopPropagation()} className="font-bold text-white hover:text-yellow-300 transition-colors">
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
  compact = false,
  reason = null,
  onOpen,
  onFilterViewer,
}: {
  event: ActivityEvent;
  now: number;
  avatar?: string;
  cardIndex: (n: number, packName?: string) => CardInfo | undefined;
  totalCards: number;
  compact?: boolean;
  /** Why this event is notable (highlighted), or null. */
  reason?: string | null;
  onOpen: () => void;
  onFilterViewer: () => void;
}) {
  const base = useContext(PanelBase);
  let icon: IconName;
  let accent = 'border-l-transparent';
  let body: ReactNode;
  let sub: ReactNode = null;
  let thumb: ReactNode = null;

  switch (e.type) {
    case 'pull': {
      const card = cardIndex(e.cardNumber, e.packName);
      icon = 'cards';
      accent = e.isNew ? 'border-l-yellow-400' : 'border-l-gray-700';
      thumb = <CardThumb card={card} stars={e.stars} />;
      body = (
        <>
          <UserLink username={e.username} /> pulled <PrintLink event={e} mod={base === '/mod'}>{e.cardName || card?.name || `#${e.cardNumber}`}</PrintLink>{' '}
          <Stars n={e.stars} />
          {e.variant && e.variant !== 'regular' && (
            <span className="ml-2 text-[10px] font-extrabold uppercase tracking-wider text-fuchsia-300 border border-fuchsia-500/50 rounded-full px-2 py-0.5">{VARIANT_LABELS[e.variant]}</span>
          )}
          {e.serial ? <span className="ml-2 align-middle"><SerialChip n={e.serial} bonus={e.bonus} /></span> : null}
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
      if (e.source === 'webhook') {
        // A webhook reward reads like a pull, with a badge saying it was granted.
        const stars = e.stars ?? card?.stars ?? 1;
        icon = 'cards';
        accent = e.isNew ? 'border-l-yellow-400' : 'border-l-gray-700';
        thumb = <CardThumb card={card} stars={stars} />;
        body = (
          <>
            <UserLink username={e.username} /> pulled <PrintLink event={e} mod={base === '/mod'}>{e.cardName || card?.name || `Card #${e.cardNumber}`}</PrintLink>{' '}
            <Stars n={stars} />
            {e.variant && e.variant !== 'regular' && (
              <span className="ml-2 text-[10px] font-extrabold uppercase tracking-wider text-fuchsia-300 border border-fuchsia-500/50 rounded-full px-2 py-0.5">{VARIANT_LABELS[e.variant]}</span>
            )}
            {e.serial ? <span className="ml-2 align-middle"><SerialChip n={e.serial} bonus={e.bonus} /></span> : null}
            {e.isNew ? <span className="ml-2 text-[10px] font-extrabold uppercase tracking-wider text-gray-950 bg-yellow-400 rounded-full px-2 py-0.5">New</span> : e.copies && e.copies > 1 ? <span className="ml-2 text-[10px] font-extrabold uppercase tracking-wider text-yellow-300 border border-yellow-500/50 rounded-full px-2 py-0.5">×{e.copies}</span> : null}
            <span className="ml-2 text-[10px] font-extrabold uppercase tracking-wider text-green-300 border border-green-500/40 rounded-full px-2 py-0.5">Granted by webhook</span>
          </>
        );
        sub = `${e.packName ?? ''}${e.packName && e.uniqueOwned !== undefined && totalCards > 0 ? ' · ' : ''}${e.uniqueOwned !== undefined && totalCards > 0 ? `${e.uniqueOwned}/${totalCards} collected` : ''}` || 'via webhook';
        break;
      }
      icon = 'gift';
      accent = 'border-l-green-400';
      thumb = <CardThumb card={card} stars={card?.stars ?? 1} />;
      body = (
        <>
          <PrintLink event={e} mod={base === '/mod'}>{card?.name ?? `Card #${e.cardNumber}`}</PrintLink> granted to <UserLink username={e.username} />
        </>
      );
      sub = 'by admin';
      break;
    }
    case 'remove': {
      const card = cardIndex(e.cardNumber);
      icon = 'trash';
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
      icon = 'sparkles';
      accent = 'border-l-yellow-400';
      thumb = <CardThumb card={card} stars={card?.stars ?? 1} />;
      body = (
        <>
          <UserLink username={e.username} /> upgraded <PrintLink event={e} mod={base === '/mod'}>{e.cardName || card?.name || `#${e.cardNumber}`}</PrintLink> to <span className="font-bold text-yellow-300">{VARIANT_LABELS[e.to]}</span>
        </>
      );
      sub = `${e.cost}× ${VARIANT_LABELS[e.from]} spent`;
      break;
    }
    case 'buff': {
      const card = cardIndex(e.cardNumber);
      icon = 'zap';
      accent = 'border-l-amber-400';
      thumb = <CardThumb card={card} stars={card?.stars ?? 1} />;
      body = (
        <>
          <UserLink username={e.username} /> used trainer card <PrintLink event={e} mod={base === '/mod'}>{e.cardName || card?.name || `#${e.cardNumber}`}</PrintLink>
        </>
      );
      sub = `${e.buffName} (${e.duration || e.buffType})`;
      break;
    }
    case 'trade':
      icon = 'trade';
      accent = e.action === 'accepted' ? 'border-l-emerald-400' : e.action === 'offered' || e.action === 'countered' ? 'border-l-blue-400' : 'border-l-red-400';
      body = (
        <>
          <UserLink username={e.username} />{' '}
          {e.action === 'accepted' ? <>traded with <UserLink username={e.partner ?? ''} /></>
            : e.action === 'offered' ? (e.kind === 'listing' ? 'posted a listing on the board' : <>offered <UserLink username={e.partner ?? ''} /> a trade</>)
            : e.action === 'countered' ? <>countered <UserLink username={e.partner ?? ''} />&rsquo;s offer</>
            : e.action === 'declined' ? 'had their offer declined'
            : e.action === 'expired' ? 'had an offer expire'
            : e.by === 'admin' ? 'had an offer cancelled by an admin' : 'cancelled an offer'}
        </>
      );
      sub = e.givePts || e.getPts
        ? `${e.give.join(', ')} (≈${e.givePts.toLocaleString()} pts) ⇄ ${e.get.join(', ')} (≈${e.getPts.toLocaleString()} pts)`
        : `${e.give.join(', ')} ⇄ ${e.get.join(', ')}`;
      break;
    case 'reset':
      icon = 'refresh';
      accent = 'border-l-red-400';
      body = e.scope === 'everyone'
        ? <>All collections were reset</>
        : <><UserLink username={e.username} />&apos;s collection was reset{e.scope === 'all' ? ' across all seasons' : ''}</>;
      break;
    case 'delete':
      icon = 'x';
      accent = 'border-l-red-400';
      body = <><UserLink username={e.username} /> was deleted</>;
      break;
    case 'trigger':
      icon = e.kind === 'pull' ? (e.source === 'admin' ? 'gift' : 'zap') : e.kind === 'card' ? 'gem' : 'book';
      accent = 'border-l-poke-blue-light';
      body = e.source === 'admin' && e.kind === 'pull' ? (
        <>{(e.count ?? 1) > 1 ? `${e.count} packs` : 'A pack'} gifted to <UserLink username={e.username} /></>
      ) : (
        <><UserLink username={e.username} /> {e.kind === 'card' ? <>showed off {e.cardName ?? 'a card'}</> : <>triggered {e.kind === 'pull' ? 'a pack draw' : 'a collection view'}</>}</>
      );
      sub = e.source === 'admin' ? 'by admin' : 'via webhook';
      break;
    case 'collection_shown':
      icon = 'tv';
      accent = 'border-l-poke-blue-light';
      body = <><UserLink username={e.username} />&apos;s collection was shown on stream</>;
      break;
  }

  // Admin-side events name the staff member who did them ("by admin" becomes "by sam").
  if (e.staff) sub = sub === 'by admin' || sub === null ? <span className="text-yellow-300/80">by {e.staff}</span> : <>{sub} <span className="text-yellow-300/80">· by {e.staff}</span></>;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(); } }}
      className={`group flex items-center gap-4 ${compact ? 'px-4 py-1.5' : 'px-5 py-3'} border-l-4 ${accent} ${reason ? 'bg-linear-to-r from-yellow-500/[0.07] to-transparent' : ''} hover:bg-white/3 transition-colors cursor-pointer focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-yellow-400`}
    >
      {!compact && (e.username ? (
        <Avatar src={avatar} name={e.username} className="w-9 h-9 text-sm" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-base shrink-0 text-gray-300"><Icon name={icon} className="w-[1.1rem] h-[1.1rem]" /></div>
      ))}
      <div className="min-w-0 flex-1">
        <p className={`${compact ? 'text-[13px] truncate' : 'text-sm leading-snug'} text-gray-300`}>
          <Icon name={icon} className="mr-1.5 text-gray-400" />
          {body}
          {reason && <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-yellow-300"><Icon name="sparkles" className="w-3 h-3" />{reason}</span>}
        </p>
        {sub && !compact && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
      {!compact && thumb}
      {e.username && (
        <button type="button" onClick={ev => { ev.stopPropagation(); onFilterViewer(); }} title={`Show only ${e.username}`} aria-label={`Show only ${e.username}`} className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-7 h-7 shrink-0 rounded-lg border border-gray-700 text-gray-400 hover:text-yellow-300 hover:border-yellow-500/50 flex items-center justify-center transition-opacity"><Icon name="filter" className="w-3.5 h-3.5" /></button>
      )}
      <time className="text-xs text-gray-500 tabular-nums shrink-0 w-16 text-right" dateTime={new Date(e.at).toISOString()} title={new Date(e.at).toLocaleString('en-GB', { timeZone: 'UTC' })}>
        {timeAgo(e.at, now)}
      </time>
    </div>
  );
}
