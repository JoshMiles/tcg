'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Icon } from '@/app/components/Icon';
import { Avatar } from '@/app/components/Avatar';
import { Spinner } from '@/app/components/PendingButton';
import { ConfirmButton } from '../components/ConfirmButton';
import { bulkGiftAction, bulkTagAction } from '../users-actions';
import { useSlashFocus } from '../components/use-slash-focus';
import { SORT_KEYS, USERS_PAGE_SIZE, usersQueryString, type ActivityKey, type UserRow, type UsersQuery } from '@/lib/users-list';

type SortKey = (typeof SORT_KEYS)[number];
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'cards', label: 'Most cards' }, { key: 'score', label: 'Score' }, { key: 'pulls', label: 'Most pulls' },
  { key: 'active', label: 'Recently active' }, { key: 'joined', label: 'Newest' }, { key: 'trades', label: 'Most trades' }, { key: 'name', label: 'A–Z' },
];
const ACTIVITY: [ActivityKey, string][] = [['any', 'Any time'], ['24h', 'Last 24 hours'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['never', 'Never seen']];

const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${on ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300' : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:text-white'}`;

function ago(at: number | null, now: number): string {
  if (!at) return '-';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * The users table. The server filters, sorts and pages it (search params ?q= &sort= &activity= &tag= &complete= &shiny= &full= &restricted= &notes= &page=,
 * lib/users-list.ts): this only shows one page of `rows` and changes the URL. It owns the selection (bulk gift, add / remove a tag); the CSV export
 * is a server route that exports the whole filtered list, or the ticked viewers.
 */
export function UsersList({ rows, query, matches, total, page, pages, allTags, activeSeason }: { rows: UserRow[]; query: UsersQuery; matches: number; total: number; page: number; pages: number; allTags: string[]; activeSeason: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(query.q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState('');
  const [giftCount, setGiftCount] = useState('1');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [now] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);

  useSlashFocus(input);

  const href = (over: Partial<UsersQuery> = {}) => { const q = usersQueryString(query, over); return q ? `?${q}` : '?'; };
  const go = (over: Partial<UsersQuery>) => startTransition(() => router.replace(href(over)));
  const filtered = !!(query.q || query.activity !== 'any' || query.complete || query.shiny || query.full || query.tag || query.restricted || query.notes);
  const clear = () => { setText(''); go({ q: '', activity: 'any', complete: false, shiny: false, full: false, tag: '', restricted: false, notes: false }); };
  const allShownSelected = rows.length > 0 && rows.every(r => selected.has(r.username));
  const toggleAll = () => setSelected(s => { const n = new Set(s); if (allShownSelected) rows.forEach(r => n.delete(r.username)); else rows.forEach(r => n.add(r.username)); return n; });
  const toggleOne = (u: string) => setSelected(s => { const n = new Set(s); if (n.has(u)) n.delete(u); else n.add(u); return n; });
  const chosen = [...selected];
  const exportHref = `/api/admin/users/export${href({ page: 1 })}${chosen.length > 0 ? `${usersQueryString(query, { page: 1 }) ? '&' : ''}only=${encodeURIComponent(chosen.join(','))}` : ''}`;

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => startTransition(async () => {
    setMessage(null);
    try { const r = await fn(); setMessage({ ok: r.ok, text: r.message }); if (r.ok) setSelected(new Set()); } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : 'That did not work.' }); }
  });

  const cols = 'grid-cols-[1.75rem_2.25rem_minmax(11rem,1.5fr)_minmax(9rem,1.2fr)_5rem_4.5rem_4rem_5.5rem_3.5rem]';
  const select = 'select select-sm';

  return (
    <div>
      {/* Search, sort, filters */}
      <div className="px-6 py-4 border-b border-gray-800 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-56 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"><Icon name="search" /></span>
            <form onSubmit={e => { e.preventDefault(); go({ q: text.trim() }); }}>
              <input ref={input} type="search" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setText(''); go({ q: '' }); } }} placeholder="Search viewers, names or tags…  ( / )  then Enter" aria-label="Search viewers" className="input w-full pl-9" />
            </form>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500">Sort
            <select value={query.sort} onChange={e => go({ sort: e.target.value as SortKey })} className={select}>{SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-500">Active
            <select value={query.activity} onChange={e => go({ activity: e.target.value as ActivityKey })} className={select}>{ACTIVITY.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          </label>
          {allTags.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-gray-500">Tag
              <select value={query.tag} onChange={e => go({ tag: e.target.value })} className={select}><option value="">Any</option>{allTags.map(t => <option key={t} value={t}>{t}</option>)}</select>
            </label>
          )}
          <span className="ml-auto flex items-center gap-2">
            {matches > 0 && <a href={exportHref} download className={chip(false)}><Icon name="download" className="mr-1" />Export {chosen.length > 0 ? `${chosen.length} selected` : `${matches} matching`}</a>}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => go({ complete: !query.complete })} aria-pressed={query.complete} className={chip(query.complete)}><Icon name="cheese" className="mr-1" />Complete collection</button>
          <button type="button" onClick={() => go({ shiny: !query.shiny })} aria-pressed={query.shiny} className={chip(query.shiny)}><Icon name="sparkles" className="mr-1" />Has a Full Art Holo</button>
          <button type="button" onClick={() => go({ full: !query.full })} aria-pressed={query.full} className={chip(query.full)}><Icon name="gem" className="mr-1" />Has Full Art</button>
          <button type="button" onClick={() => go({ restricted: !query.restricted })} aria-pressed={query.restricted} className={chip(query.restricted)}><Icon name="shield" className="mr-1" />Restricted</button>
          <button type="button" onClick={() => go({ notes: !query.notes })} aria-pressed={query.notes} className={chip(query.notes)}><Icon name="note" className="mr-1" />Has notes</button>
          {filtered && <button type="button" onClick={clear} className="text-xs font-semibold text-gray-400 hover:text-white underline underline-offset-2">Clear</button>}
          <span className="ml-auto text-xs text-gray-500">{matches} of {total}</span>
        </div>
      </div>

      {/* Bulk actions */}
      {chosen.length > 0 && (
        <div className="dash-slide px-6 py-3 border-b border-yellow-500/30 bg-yellow-500/5 flex flex-wrap items-center gap-3 text-sm">
          <strong className="text-yellow-300">{chosen.length} selected</strong>
          <form className="flex items-center gap-1.5" onSubmit={e => { e.preventDefault(); run(() => bulkGiftAction(chosen, Number(giftCount))); }}>
            <select value={giftCount} onChange={e => setGiftCount(e.target.value)} aria-label="Packs" className={select}>{[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n} pack{n === 1 ? '' : 's'}</option>)}</select>
            <ConfirmButton
              title="Gift packs to everyone selected?"
              confirmLabel="Gift packs"
              tone="primary"
              message={<>Queue <strong className="text-white">{giftCount} pack{Number(giftCount) === 1 ? '' : 's'}</strong> for each of <strong className="text-white">{chosen.length} viewer{chosen.length === 1 ? '' : 's'}</strong> ({Number(giftCount) * chosen.length} openings in all). They play on stream one after another, even if the overlay is not connected yet.</>}
              className={chip(false)}
            >
              <Icon name="gift" className="mr-1" />Gift
            </ConfirmButton>
          </form>
          <form className="flex items-center gap-1.5" onSubmit={e => { e.preventDefault(); if (bulkTag.trim()) run(() => bulkTagAction(chosen, bulkTag, 'add')); }}>
            <input value={bulkTag} onChange={e => setBulkTag(e.target.value)} list="all-tags" placeholder="tag" aria-label="Tag" maxLength={20} className="input input-sm w-28" />
            <datalist id="all-tags">{allTags.map(t => <option key={t} value={t} />)}</datalist>
            <button type="submit" disabled={pending || !bulkTag.trim()} className={chip(false)}>Add tag</button>
            <button type="button" disabled={pending || !bulkTag.trim()} onClick={() => run(() => bulkTagAction(chosen, bulkTag, 'remove'))} className={chip(false)}>Remove tag</button>
          </form>
          {pending && <Spinner />}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-gray-400 hover:text-white underline underline-offset-2">Clear selection</button>
        </div>
      )}
      {message && <p role="status" className={`px-6 py-2 text-sm ${message.ok ? 'text-green-300 bg-green-500/10' : 'text-amber-200 bg-amber-500/10'}`}>{message.text}</p>}

      <div className="overflow-x-auto">
        <div className="min-w-240">
          <div className={`grid ${cols} gap-3 px-6 py-3 border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider items-center`}>
            <input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="Select all shown" className="accent-yellow-400" />
            <span>#</span><span>Viewer</span><span>{activeSeason ? 'Collection' : 'Collection'}</span>
            <span className="text-right" title={activeSeason ? `Score in ${activeSeason}` : 'No active season'}>Score</span>
            <span className="text-right">Pulls</span><span className="text-right">Trades</span><span className="text-right">Last seen</span><span />
          </div>

          {rows.length === 0 && <p className="py-14 text-center text-sm text-gray-500">No viewers match these filters.{' '}<button type="button" onClick={clear} className="text-yellow-400 hover:text-yellow-300 underline underline-offset-2">Clear them</button></p>}

          {rows.map((r, i) => {
            const pct = r.primary?.pct ?? 0;
            const bar = pct >= 80 ? 'from-amber-300 to-amber-500' : pct >= 50 ? 'from-green-300 to-green-500' : 'from-gray-500 to-gray-400';
            const dupes = r.pulls - r.unique;
            return (
              <div key={r.username} className={`relative grid ${cols} gap-3 items-center px-6 py-3 border-t border-gray-800/60 first:border-0 hover:bg-white/3 transition-colors ${selected.has(r.username) ? 'bg-yellow-500/4' : ''}`}>
                <Link href={`/admin/users/${r.username}`} aria-label={`Manage ${r.displayName}`} className="absolute inset-0" />
                <input type="checkbox" checked={selected.has(r.username)} onChange={() => toggleOne(r.username)} aria-label={`Select ${r.username}`} className="relative z-10 accent-yellow-400" />
                <span className="text-xs text-gray-600 tabular-nums">{(page - 1) * USERS_PAGE_SIZE + i + 1}</span>
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar src={r.avatar} name={r.displayName} className="w-9 h-9 text-sm" />
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm truncate">{r.displayName}{r.noTrading && <Icon name="ban" className="ml-1.5 w-3.5 h-3.5 text-red-400" title="Trading blocked" />}{r.hidden && <Icon name="shield" className="ml-1 w-3.5 h-3.5 text-amber-400" title="Hidden from public boards" />}</p>
                    <p className="text-xs text-gray-600 truncate">
                      <span className="font-mono">{r.displayName !== r.username ? `@${r.username}` : r.isTwitch ? 'Twitch linked' : ''}</span>
                      {r.tags.slice(0, 3).map(t => <span key={t} className="ml-1.5 rounded-full border border-gray-700 px-1.5 py-px text-[10px] text-gray-400">{t}</span>)}
                    </p>
                  </div>
                </div>
                <div className="min-w-0">
                  {r.primary ? (
                    <>
                      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden"><div className={`h-full rounded-full bg-linear-to-r ${bar}`} style={{ width: `${pct}%` }} /></div>
                      <p className="mt-1 text-xs text-gray-400 truncate"><span className="font-bold text-white tabular-nums">{r.primary.owned}/{r.primary.total}</span><span className="tabular-nums"> · {pct}%</span><span className="text-gray-600"> · {r.primary.name}{r.otherSeasons > 0 ? ` +${r.otherSeasons}` : ''}</span></p>
                    </>
                  ) : <span className="text-xs text-gray-600">-</span>}
                </div>
                <span className="text-right tabular-nums text-sm text-yellow-400 font-semibold" title={r.scoreRank ? `Rank #${r.scoreRank}` : undefined}>{r.score !== null ? r.score.toLocaleString() : '-'}{r.scoreRank && <span className="block text-[10px] text-gray-600 font-normal">#{r.scoreRank}</span>}</span>
                <span className="text-right tabular-nums text-sm text-gray-300" title={dupes > 0 ? `${r.unique} unique, ${dupes} duplicate${dupes === 1 ? '' : 's'}` : undefined}>{r.pulls}{dupes > 0 && <span className="block text-[10px] text-gray-600">{dupes} dupes</span>}</span>
                <span className="text-right tabular-nums text-sm text-gray-400">{r.trades || '-'}</span>
                <span className="text-right text-xs text-gray-500 tabular-nums" title={r.joined ? `Joined ${new Date(r.joined).toLocaleDateString('en-GB', { timeZone: 'UTC' })}` : undefined}>{ago(r.lastActive, now)}</span>
                <div className="relative z-10 flex items-center justify-end gap-1">
                  <Link href={`/admin?gift=${encodeURIComponent(r.username)}#quick-actions`} title={`Gift ${r.displayName} a pack`} className="px-1.5 py-1 rounded-lg hover:bg-white/10 transition-colors"><Icon name="gift" /></Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 px-6 py-3 border-t border-gray-800 text-sm">
          {page > 1 ? <Link href={href({ page: page - 1 })} className={chip(false)}>Previous</Link> : <span />}
          <span className="text-xs text-gray-500 tabular-nums">Page {page} of {pages}</span>
          {page < pages ? <Link href={href({ page: page + 1 })} className={chip(false)}>Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
