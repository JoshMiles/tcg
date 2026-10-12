'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/app/components/Icon';
import { Spinner } from '../../components/PendingButton';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import {
  cancelUserTradeAction, giftPacksAction, grantManyAction, mergeUserAction, restoreSnapshotAction, saveFlagsAction, saveTagsAction,
  type UserActionResult,
} from '../../users-actions';

const field = 'rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500';
const btn = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-700 text-gray-200 hover:border-gray-500 hover:bg-white/5 disabled:opacity-50 transition-colors';

function Result({ r }: { r: UserActionResult | null }) {
  if (!r) return null;
  return <p role="status" className={`text-sm rounded-lg px-3 py-2 border ${r.ok ? 'text-green-300 bg-green-500/10 border-green-400/30' : 'text-amber-200 bg-amber-500/10 border-amber-400/30'}`}>{r.message}</p>;
}

/** Tags: admin-only labels. Click × to remove, type to add (suggestions below). */
export function TagsEditor({ username, initial, suggestions }: { username: string; initial: string[]; suggestions: string[] }) {
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();
  const save = (next: string[]) => { setTags(next); startTransition(async () => { setTags(await saveTagsAction(username, next)); }); };
  const add = (t: string) => { const v = t.trim().toLowerCase(); if (v && !tags.includes(v)) save([...tags, v]); setDraft(''); };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length === 0 && <span className="text-sm text-gray-600">No tags yet.</span>}
        {tags.map(t => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full border border-gray-600 bg-gray-800/60 pl-2.5 pr-1 py-0.5 text-xs font-semibold text-gray-200">
            {t}<button type="button" onClick={() => save(tags.filter(x => x !== t))} aria-label={`Remove tag ${t}`} className="w-4 h-4 rounded-full hover:bg-white/10 flex items-center justify-center"><Icon name="x" className="w-3 h-3" /></button>
          </span>
        ))}
        {pending && <Spinner />}
      </div>
      <form onSubmit={e => { e.preventDefault(); add(draft); }} className="flex items-center gap-2">
        <input value={draft} onChange={e => setDraft(e.target.value)} maxLength={20} placeholder="Add a tag…" aria-label="New tag" className={`${field} w-44 py-1.5 text-xs`} />
        <button type="submit" disabled={!draft.trim()} className={`${btn} py-1.5 text-xs`}>Add</button>
        {suggestions.filter(s => !tags.includes(s)).slice(0, 5).map(s => <button key={s} type="button" onClick={() => add(s)} className="text-[11px] text-gray-500 hover:text-yellow-300">+ {s}</button>)}
      </form>
    </div>
  );
}

/** Moderation: stop this viewer trading and/or hide them from public rankings. Reason is admin-only. */
export function ModerationPanel({ username, initial }: { username: string; initial: { noTrading: boolean; hideFromBoard: boolean; reason: string; at?: number } }) {
  const [noTrading, setNoTrading] = useState(initial.noTrading);
  const [hide, setHide] = useState(initial.hideFromBoard);
  const [reason, setReason] = useState(initial.reason);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UserActionResult | null>(null);
  const dirty = noTrading !== initial.noTrading || hide !== initial.hideFromBoard || reason !== initial.reason;
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 text-sm text-gray-300 cursor-pointer"><input type="checkbox" checked={noTrading} onChange={e => setNoTrading(e.target.checked)} className="mt-1 accent-yellow-400" /><span><strong className="text-white">Block trading.</strong> They can&apos;t make or accept offers, and nobody can offer to them. Existing offers can still be cancelled.</span></label>
      <label className="flex items-start gap-3 text-sm text-gray-300 cursor-pointer"><input type="checkbox" checked={hide} onChange={e => setHide(e.target.checked)} className="mt-1 accent-yellow-400" /><span><strong className="text-white">Hide from public boards.</strong> Left out of the leaderboard, the card owner lists and recent pulls. Their own collection page still works.</span></label>
      {(noTrading || hide) && <input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="Reason (only admins see this)" aria-label="Reason" className={`${field} w-full`} />}
      {initial.at && (initial.noTrading || initial.hideFromBoard) && <p className="text-xs text-gray-600">Set {new Date(initial.at).toLocaleString()}</p>}
      <div className="flex items-center gap-3">
        <button type="button" disabled={!dirty || pending} onClick={() => startTransition(async () => { setResult(await saveFlagsAction(username, { noTrading, hideFromBoard: hide, reason })); })} className={btn}>{pending && <Spinner />}Save restrictions</button>
      </div>
      <Result r={result} />
    </div>
  );
}

export interface GrantCard { number: number; name: string; stars: number; pack: string }

/** Grant cards (several at once, a number of copies, any version) and gift packs, to this viewer, in the active season. */
export function GrantPanel({ username, cards, upgrades }: { username: string; cards: GrantCard[]; upgrades: boolean }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [variant, setVariant] = useState('regular');
  const [copies, setCopies] = useState('1');
  const [packs, setPacks] = useState('1');
  const [q, setQ] = useState('');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UserActionResult | null>(null);
  const shown = cards.filter(c => !q.trim() || `${c.name} ${c.number}`.toLowerCase().includes(q.trim().toLowerCase()));
  const run = (fn: () => Promise<UserActionResult>) => startTransition(async () => { try { setResult(await fn()); } catch (e) { setResult({ ok: false, message: e instanceof Error ? e.message : 'That did not work.' }); } });
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search cards…" aria-label="Search cards" className={`${field} w-48 py-1.5 text-xs`} />
          <span className="text-xs text-gray-500">{picked.length} selected</span>
          {picked.length > 0 && <button type="button" onClick={() => setPicked([])} className="text-xs text-gray-400 hover:text-white underline underline-offset-2">Clear</button>}
        </div>
        <ul className="max-h-56 overflow-auto grid sm:grid-cols-2 xl:grid-cols-3 gap-1 rounded-lg border border-gray-800 bg-gray-950/40 p-2">
          {shown.map(c => (
            <li key={c.number}>
              <label className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm cursor-pointer ${picked.includes(c.number) ? 'bg-yellow-500/10 text-yellow-200' : 'text-gray-300 hover:bg-white/5'}`}>
                <input type="checkbox" checked={picked.includes(c.number)} onChange={() => setPicked(p => (p.includes(c.number) ? p.filter(x => x !== c.number) : [...p, c.number]))} className="accent-yellow-400" />
                <span className="text-xs text-gray-600 tabular-nums w-7">#{c.number}</span><span className="truncate">{c.name}</span><span className="ml-auto text-[10px] text-gray-500">{'★'.repeat(c.stars)}</span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="px-2 py-3 text-xs text-gray-600">No cards match.</li>}
        </ul>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {upgrades && (
          <label className="text-xs text-gray-500 space-y-1 block">Version
            <select value={variant} onChange={e => setVariant(e.target.value)} className={`${field} block py-1.5`}>{VARIANTS.map(v => <option key={v} value={v}>{VARIANT_LABELS[v]}</option>)}</select>
          </label>
        )}
        <label className="text-xs text-gray-500 space-y-1 block">Copies of each
          <input type="number" min={1} max={20} value={copies} onChange={e => setCopies(e.target.value)} className={`${field} block w-20 py-1.5`} />
        </label>
        <button type="button" disabled={pending || picked.length === 0} onClick={() => run(() => grantManyAction(username, picked, variant, Number(copies)))} className="tcg-btn px-4 py-2 rounded-lg text-sm disabled:opacity-50">{pending && <Spinner />}Grant {picked.length || ''} card{picked.length === 1 ? '' : 's'}</button>
        <span className="mx-1 h-6 w-px bg-gray-800" aria-hidden />
        <label className="text-xs text-gray-500 space-y-1 block">Gift packs
          <select value={packs} onChange={e => setPacks(e.target.value)} className={`${field} block py-1.5`}>{[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <button type="button" disabled={pending} onClick={() => run(() => giftPacksAction(username, Number(packs), true))} className={btn}><Icon name="gift" />Gift</button>
      </div>
      <Result r={result} />
    </div>
  );
}

export interface TradeLine { id: string; status: string; open: boolean; kind: 'direct' | 'listing'; other: string | null; mine: boolean; give: string; get: string; at: number; expiresAt?: number; season: string }

/** The viewer's trades: open offers (with an admin cancel that refunds the escrow) and recent history. */
export function TradesPanel({ username, lines }: { username: string; lines: TradeLine[] }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UserActionResult | null>(null);
  const router = useRouter();
  const open = lines.filter(l => l.open);
  const done = lines.filter(l => !l.open);
  const cancel = (id: string) => startTransition(async () => { setResult(await cancelUserTradeAction(username, id)); router.refresh(); });
  const row = (l: TradeLine) => (
    <li key={l.id} className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className={`text-[11px] font-bold rounded-full border px-2 py-0.5 ${l.status === 'accepted' ? 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10' : l.open ? 'text-sky-300 border-sky-400/30 bg-sky-500/10' : 'text-gray-400 border-gray-700'}`}>{l.open ? 'open' : l.status}</span>
      <span className="text-gray-300">{l.mine ? 'gives' : `${l.other ?? 'someone'} gives`} <strong className="text-white">{l.mine ? l.give : l.give}</strong> {l.mine ? 'for' : 'for'} <strong className="text-white">{l.get}</strong></span>
      <span className="text-xs text-gray-600">{l.kind === 'listing' ? 'board' : l.other ? (l.mine ? `to ${l.other}` : `with ${l.other}`) : ''} · {l.season}</span>
      <span className="ml-auto flex items-center gap-3 text-xs text-gray-500">{l.open && l.expiresAt ? `expires ${new Date(l.expiresAt).toLocaleString()}` : new Date(l.at).toLocaleDateString()}
        {l.open && l.mine && <button type="button" disabled={pending} onClick={() => cancel(l.id)} className="text-red-300 hover:text-red-200 font-semibold">Cancel &amp; refund</button>}</span>
    </li>
  );
  return (
    <div className="space-y-3">
      {lines.length === 0 ? <p className="text-sm text-gray-600">No trades yet.</p> : (
        <ul className="divide-y divide-gray-800/60 rounded-lg border border-gray-800 overflow-hidden">{[...open, ...done].slice(0, 20).map(row)}</ul>
      )}
      {pending && <p className="text-xs text-gray-500 flex items-center gap-2"><Spinner />Working…</p>}
      <Result r={result} />
    </div>
  );
}

export interface SnapshotLine { id: string; at: number; reason: string; cards: number; seasons: string }

/** Restore points, merging into another account, and the compare-with-another-viewer jump. */
export function ToolsPanel({ username, snapshots, collections }: { username: string; snapshots: SnapshotLine[]; collections: { cards: number; seasons: number } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UserActionResult | null>(null);
  const [into, setInto] = useState('');
  const [other, setOther] = useState('');
  const restore = (id: string) => { if (!window.confirm('Restore this restore point? The cards in it replace what the viewer has in those seasons now (the current state is saved as another restore point first).')) return; startTransition(async () => { setResult(await restoreSnapshotAction(username, id)); router.refresh(); }); };
  const merge = () => {
    const target = into.trim().replace(/^@/, '').toLowerCase();
    if (!target) return;
    if (!window.confirm(`Merge ${username} into ${target}? All ${collections.cards} of their cards (${collections.seasons} season${collections.seasons === 1 ? '' : 's'}) move to ${target}, their tags are combined, and the ${username} profile is removed. Restore points are kept for 14 days.`)) return;
    startTransition(async () => { const r = await mergeUserAction(username, target); setResult(r); if (r.ok) router.push(`/admin/users/${encodeURIComponent(target)}`); });
  };
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Compare with another viewer</h3>
        <form onSubmit={e => { e.preventDefault(); if (other.trim()) router.push(`/admin/users/${encodeURIComponent(username)}?compare=${encodeURIComponent(other.trim().replace(/^@/, '').toLowerCase())}#compare`); }} className="flex items-center gap-2">
          <input value={other} onChange={e => setOther(e.target.value)} placeholder="their username" aria-label="Compare with" className={`${field} w-56`} />
          <button type="submit" disabled={!other.trim()} className={btn}>Compare</button>
        </form>
        <p className="text-xs text-gray-600">Shows what each has that the other lacks, and swaps that would complete both.</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Restore points</h3>
        {snapshots.length === 0 ? <p className="text-sm text-gray-600">None. One is saved automatically before a reset, a delete or a merge, and kept for 14 days.</p> : (
          <ul className="divide-y divide-gray-800/60 rounded-lg border border-gray-800 overflow-hidden">
            {snapshots.map(s => (
              <li key={s.id} className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-gray-200">{s.reason}</span>
                <span className="text-xs text-gray-500">{s.cards} cards · {s.seasons || 'profile only'}</span>
                <span className="ml-auto flex items-center gap-3 text-xs text-gray-500">{new Date(s.at).toLocaleString()}<button type="button" disabled={pending} onClick={() => restore(s.id)} className="text-yellow-400 hover:text-yellow-300 font-semibold">Restore</button></span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Merge into another account</h3>
        <p className="text-xs text-gray-500">For a viewer who changed their Twitch name: moves every card across all seasons into the account you name and removes this profile. Refused while either account has open trade offers.</p>
        <form onSubmit={e => { e.preventDefault(); merge(); }} className="flex items-center gap-2">
          <input value={into} onChange={e => setInto(e.target.value)} placeholder="username to merge into" aria-label="Merge into" className={`${field} w-56`} />
          <button type="submit" disabled={pending || !into.trim() || collections.cards + snapshots.length < 0} className={`${btn} hover:border-amber-400/60 hover:text-amber-200`}>{pending && <Spinner />}Merge…</button>
        </form>
      </div>
      <Result r={result} />
    </div>
  );
}

export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="Sections" className="flex flex-wrap gap-2 sticky top-0 z-10 bg-gray-950/90 backdrop-blur py-2 -mx-1 px-1">
      {items.map(i => <Link key={i.id} href={`#${i.id}`} className="px-3 py-1.5 rounded-full text-xs font-bold border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors">{i.label}</Link>)}
    </nav>
  );
}
