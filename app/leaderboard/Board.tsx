'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, RankMedal } from '@/app/components/Icon';
import { Avatar } from '@/app/components/Avatar';
import { METRIC_LABELS, filterBoard, rankBoard, rankMovement, rankSnapshot, type BoardMetric, type BoardRow } from '@/lib/board-view';
import { profileHref } from '@/lib/profile-url';

const PAGE = 25;
const ALL_METRICS = Object.keys(METRIC_LABELS) as BoardMetric[];
const SHORT = { reverse: 'RH', full: 'FA', shiny: 'SH' } as const;
const LABEL = { reverse: 'Reverse Holo', full: 'Full Art', shiny: 'Shiny' } as const;
type Moves = Record<string, number>;

/**
 * The leaderboard list: switch what it ranks by, search for a collector, show only complete collections, open a row for its points
 * breakdown, and see who moved since you last looked (remembered in this browser). Ranks never change when you search, so
 * finding someone still shows their true place.
 */
export function Board({ rows, avatars, totalCards, seasonId, viewer, noVariants = false }: { rows: BoardRow[]; avatars: Record<string, string | undefined>; totalCards: number; seasonId: string; viewer?: string; /** Rows without per-version counts (an old final standing): no Shinies ranking. */ noVariants?: boolean }) {
  const METRICS = noVariants ? ALL_METRICS.filter(m => m !== 'shiny') : ALL_METRICS;
  const [metric, setMetric] = useState<BoardMetric>('points');
  const [q, setQ] = useState('');
  const [completeOnly, setCompleteOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [moves, setMoves] = useState<Moves>({});
  const meRef = useRef<HTMLLIElement | null>(null);

  const ranked = useMemo(() => rankBoard(rows, metric), [rows, metric]);
  const list = useMemo(() => filterBoard(ranked, { q, completeOnly }), [ranked, q, completeOnly]);
  const me = viewer ? ranked.find(r => r.row.username === viewer) : undefined;

  // Rank movement since the last visit: compare with the points ranking saved here, and save a fresh one once it is an hour old
  // (so reloading the page doesn't wipe the arrows).
  useEffect(() => {
    const key = `tcg_board_ranks:${seasonId}`;
    const now = rankBoard(rows, 'points');
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as { at: number; ranks: Record<string, number> } | null;
      if (saved?.ranks) setMoves(rankMovement(saved.ranks, now));
      if (!saved || Date.now() - saved.at > 3_600_000) localStorage.setItem(key, JSON.stringify({ at: Date.now(), ranks: rankSnapshot(now) }));
    } catch { /* storage unavailable */ }
  }, [rows, seasonId]);

  const jumpToMe = () => {
    if (!me) return;
    setQ(''); setCompleteOnly(false);
    const idx = ranked.findIndex(r => r.row.username === viewer);
    setShown(s => Math.max(s, idx + 1));
    setTimeout(() => meRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }), 50);
  };

  const visible = list.slice(0, shown);
  const chip = 'px-3 py-1 rounded-full text-xs font-semibold border transition-colors';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Rank by">
        {METRICS.map(m => (
          <button key={m} type="button" onClick={() => { setMetric(m); setShown(PAGE); }} aria-pressed={metric === m} className={`${chip} ${metric === m ? 'bg-yellow-500 text-gray-950 border-yellow-500' : 'text-gray-400 border-gray-700 hover:text-white'}`}>{METRIC_LABELS[m]}</button>
        ))}
        <span className="mx-1 h-4 w-px bg-gray-800" aria-hidden />
        <button type="button" onClick={() => { setCompleteOnly(c => !c); setShown(PAGE); }} aria-pressed={completeOnly} className={`${chip} ${completeOnly ? 'bg-yellow-500 text-gray-950 border-yellow-500' : 'text-gray-400 border-gray-700 hover:text-white'}`}><Icon name="cheese" className="mr-1" />Complete only</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input type="search" value={q} onChange={e => { setQ(e.target.value); setShown(PAGE); }} placeholder="Find a collector" aria-label="Find a collector" className="min-w-0 flex-1 basis-48 rounded-xl bg-gray-950 border border-gray-700 focus:border-yellow-500 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none" />
        {me && (
          <button type="button" onClick={jumpToMe} className="inline-flex items-center gap-1.5 rounded-xl border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-sm font-bold text-yellow-200 hover:bg-yellow-500/20">
            <Icon name="user" />You are #{me.rank}
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <p className="rind rounded-2xl p-8 text-center text-sm text-gray-400">{q || completeOnly ? 'No collector matches.' : 'No one is on the board yet.'}</p>
      ) : (
        <ol className="space-y-2">
          {visible.map(({ row: r, rank }) => {
            const mine = r.username === viewer;
            const isOpen = open === r.username;
            const mv = metric === 'points' ? moves[r.username] : undefined;
            return (
              <li key={r.username} ref={mine ? meRef : undefined} className={`tcg-panel rounded-xl ${rank === 1 ? 'ring-1 ring-yellow-500/50' : ''} ${mine ? 'ring-2 ring-yellow-500/80' : ''}`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="w-9 text-center font-bold text-gray-500 tabular-nums shrink-0">{rank <= 3 ? <RankMedal rank={rank} /> : rank}</span>
                  <Link href={profileHref(r.username)} className="flex items-center gap-3 min-w-0 flex-1 group">
                    <Avatar src={avatars[r.username]} name={r.username} className="w-9 h-9 text-sm shrink-0" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-semibold text-white group-hover:text-yellow-200">
                        <span className="truncate">{r.username}</span>
                        {mine && <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-yellow-300">you</span>}
                        {r.complete && <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-gray-950 bg-yellow-400 rounded-full px-2 py-0.5" title="Owns every card in the season"><Icon name="cheese" className="sm:mr-1" /><span className="hidden sm:inline">Complete</span><span className="sr-only sm:hidden">Complete</span></span>}
                      </span>
                      <span className="block text-xs text-gray-500 sm:truncate">
                        {r.uniqueCards}/{totalCards} cards · {r.copies.toLocaleString()} print{r.copies === 1 ? '' : 's'}
                        {(['reverse', 'full', 'shiny'] as const).filter(v => r.variants[v] > 0).map(v => <span key={v} className="ml-2 text-fuchsia-300" title={LABEL[v]}>{r.variants[v]}× {SHORT[v]}</span>)}
                      </span>
                    </span>
                  </Link>
                  {mv !== undefined && <span className={`text-xs font-bold tabular-nums shrink-0 ${mv > 0 ? 'text-emerald-400' : 'text-rose-400'}`} title={`${mv > 0 ? 'Up' : 'Down'} ${Math.abs(mv)} since you last looked`}>{mv > 0 ? '▲' : '▼'}{Math.abs(mv)}</span>}
                  <button type="button" onClick={() => setOpen(isOpen ? null : r.username)} aria-expanded={isOpen} aria-label={`${r.username}: ${isOpen ? 'hide' : 'show'} the points breakdown`} className="text-right shrink-0 group">
                    <span className="block font-display text-2xl font-bold text-yellow-400 tabular-nums leading-none">{metric === 'points' ? r.score.toLocaleString() : (metric === 'cards' ? r.uniqueCards : metric === 'copies' ? r.copies : r.variants.shiny).toLocaleString()}</span>
                    <span className="block text-[10px] text-gray-500 group-hover:text-gray-300">{metric === 'points' ? 'points' : METRIC_LABELS[metric].toLowerCase()} <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} className="w-3 h-3" /></span>
                  </button>
                </div>
                {isOpen && (
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-gray-800/70 px-4 py-3 text-sm">
                    <div><dt className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Cards</dt><dd className="tabular-nums text-white">{Math.round(r.cardPoints).toLocaleString()}</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">{r.bonusesTogether ? 'Bonuses' : 'Progress bonus'}</dt><dd className="tabular-nums text-emerald-300">+{Math.round(r.completionBonus).toLocaleString()}</dd></div>
                    {!r.bonusesTogether && <div><dt className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Full set bonus</dt><dd className="tabular-nums text-emerald-300">{r.setBonus ? `+${Math.round(r.setBonus).toLocaleString()}` : '-'}</dd></div>}
                    <div><dt className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Total</dt><dd className="tabular-nums text-yellow-300 font-bold">{Math.round(r.score).toLocaleString()}</dd></div>
                  </dl>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {list.length > shown && (
        <button type="button" onClick={() => setShown(s => s + PAGE)} className="w-full rounded-xl border border-gray-700 py-2.5 text-sm font-semibold text-gray-300 hover:text-white hover:border-gray-500">Show {Math.min(PAGE, list.length - shown)} more ({list.length - shown} left)</button>
      )}
      <p className="text-center text-xs text-gray-600">Arrows show places gained or lost on the points board since you last looked, in this browser.</p>
    </div>
  );
}
