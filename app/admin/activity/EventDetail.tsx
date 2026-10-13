'use client';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { Icon } from '@/app/components/Icon';
import { Avatar } from '@/app/components/Avatar';
import { cardThumbUrl } from '@/lib/card-art';
import { VARIANT_LABELS, encodeEntry } from '@/lib/variants';
import { cardNumberOf, notableReason, plainText, type CardNamer } from '@/lib/activity-view';
import type { ActivityEvent } from '@/lib/activity';
import { quickAction, removeUserCard } from '../actions';
import { Spinner } from '../components/PendingButton';
import type { CardInfo } from './ActivityFeed';

type Outcome = { ok: boolean; message: string } | null;

/** A side panel with one event in full, and actions that apply to it (gift, grant again, remove a copy, open the viewer). */
export function EventDetail({ event: e, avatar, card, totalCards, cardName, onClose, onFilterViewer }: {
  event: ActivityEvent;
  avatar?: string;
  card?: CardInfo;
  totalCards: number;
  cardName: CardNamer;
  onClose: () => void;
  onFilterViewer: (username: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [packs, setPacks] = useState('1');

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => setOutcome(null), [e.seq]);

  const reason = notableReason(e, totalCards);
  const cardNumber = cardNumberOf(e);
  const variant = 'variant' in e && e.variant ? e.variant : 'regular';
  const hasViewer = !!e.username;

  const run = (fn: () => Promise<Outcome>) => startTransition(async () => {
    try { setOutcome(await fn()); } catch (err) { setOutcome({ ok: false, message: err instanceof Error ? err.message : 'That did not work.' }); }
  });
  const gift = () => run(async () => {
    const fd = new FormData();
    fd.set('intent', 'gift'); fd.set('username', e.username); fd.set('count', packs);
    return quickAction(null, fd);
  });
  const grantAgain = () => run(async () => {
    const fd = new FormData();
    fd.set('intent', 'grant'); fd.set('username', e.username); fd.set('cardNumber', String(cardNumber)); fd.set('variant', variant);
    return quickAction(null, fd);
  });
  const removeCopy = () => run(async () => {
    await removeUserCard(e.username, e.collectionName ?? '', encodeEntry(cardNumber!, variant));
    return { ok: true, message: `Removed one ${variant === 'regular' ? '' : VARIANT_LABELS[variant] + ' '}copy from ${e.username}.` };
  });

  const act = 'inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-700 text-gray-200 hover:border-gray-500 hover:bg-white/5 disabled:opacity-50 transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Event details">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="dash-slide-x relative w-full max-w-md h-full overflow-y-auto bg-gray-900 border-l border-gray-800 shadow-2xl p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">{e.type}{'action' in e ? ` · ${e.action}` : ''}</p>
            <h2 className="font-display text-xl font-bold text-white leading-snug mt-0.5">{plainText(e, cardName)}</h2>
            <p className="text-xs text-gray-500 mt-1">{new Date(e.at).toLocaleString()}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 rounded-lg border border-gray-700 text-gray-400 hover:text-white flex items-center justify-center"><Icon name="x" className="w-4 h-4" /></button>
        </div>

        {reason && <p className="inline-flex items-center gap-2 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs font-bold text-yellow-300"><Icon name="sparkles" />{reason}</p>}

        {hasViewer && (
          <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950/50 p-3">
            <Avatar src={avatar} name={e.username} className="w-10 h-10 text-sm" />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-white truncate">{e.username}</p>
              <p className="text-xs text-gray-500">Viewer</p>
            </div>
            <button type="button" onClick={() => { onFilterViewer(e.username); onClose(); }} className="text-xs font-semibold text-yellow-400 hover:text-yellow-300"><Icon name="filter" className="mr-1" />Show only them</button>
          </div>
        )}

        {card && (
          <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950/50 p-3">
            <img src={cardThumbUrl(card.imageUrl)} alt="" className="w-14 h-20 rounded object-cover border border-gray-700" />
            <div className="min-w-0">
              <p className="font-bold text-white truncate">{card.name}</p>
              <p className="text-xs text-gray-500">#{card.number} · {card.packName}</p>
              {variant !== 'regular' && <p className="text-xs text-fuchsia-300 mt-0.5">{VARIANT_LABELS[variant]}</p>}
            </div>
          </div>
        )}

        {e.type === 'pull' && (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {e.serial ? <div className="rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2 col-span-2"><dt className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Serial number</dt><dd className="text-white font-semibold">#{e.serial}{e.bonus ? <span className="text-yellow-300"> · ×{e.bonus} points bonus</span> : <span className="text-gray-500"> · no bonus</span>}</dd></div> : null}
            <div className="rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2"><dt className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Copies now</dt><dd className="text-white font-semibold tabular-nums">{e.copies}</dd></div>
            <div className="rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2"><dt className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Collected</dt><dd className="text-white font-semibold tabular-nums">{e.uniqueOwned}{totalCards > 0 ? `/${totalCards}` : ''}</dd></div>
          </dl>
        )}

        {e.type === 'trade' && (
          <div className="grid gap-2 text-sm">
            <div className="rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{e.username} gives{e.givePts ? ` · ≈${e.givePts.toLocaleString()} pts` : ''}</p><p className="text-gray-200">{e.give.join(', ') || '-'}</p></div>
            <div className="rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{e.partner ?? 'In return'} gives{e.getPts ? ` · ≈${e.getPts.toLocaleString()} pts` : ''}</p><p className="text-gray-200">{e.get.join(', ') || '-'}</p></div>
            {e.note && <p className="text-xs text-gray-400 italic">“{e.note}”</p>}
          </div>
        )}

        {/* Actions */}
        {hasViewer && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Actions</p>
            <div className="grid grid-cols-2 gap-2">
              <Link href={`/admin/users/${encodeURIComponent(e.username)}`} className={act}><Icon name="user" />Open viewer</Link>
              <a href={`/collection/${encodeURIComponent(e.username)}`} target="_blank" rel="noreferrer" className={act}><Icon name="cards" />Their collection ↗</a>
            </div>
            <div className="flex items-center gap-2">
              <select value={packs} onChange={ev => setPacks(ev.target.value)} aria-label="Packs to gift" className="rounded-lg bg-gray-950 border border-gray-700 px-2 py-2 text-sm text-white">
                {[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n} pack{n === 1 ? '' : 's'}</option>)}
              </select>
              <button type="button" onClick={gift} disabled={pending} className={`${act} flex-1`}><Icon name="gift" />Gift {packs} pack{packs === '1' ? '' : 's'}</button>
            </div>
            {cardNumber !== undefined && (e.type === 'pull' || e.type === 'grant' || e.type === 'upgrade' || e.type === 'remove') && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={grantAgain} disabled={pending} className={act}><Icon name="cards" />Grant again</button>
                <button type="button" onClick={removeCopy} disabled={pending || !e.collectionName} className={`${act} hover:border-red-400/60 hover:text-red-300`}><Icon name="trash" />Remove a copy</button>
              </div>
            )}
            {pending && <p className="text-xs text-gray-500 flex items-center gap-2"><Spinner />Working…</p>}
            {outcome && <p role="status" className={`text-sm rounded-lg px-3 py-2 border ${outcome.ok ? 'text-green-300 bg-green-500/10 border-green-400/30' : 'text-amber-200 bg-amber-500/10 border-amber-400/30'}`}>{outcome.message}</p>}
          </div>
        )}

        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer select-none hover:text-gray-300">Raw event</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-950 border border-gray-800 p-3 text-[11px] text-gray-400">{JSON.stringify(e, null, 2)}</pre>
        </details>
      </aside>
    </div>
  );
}
