'use client';
import { PendingButton } from './PendingButton';
import { useActionState, useEffect, useState } from 'react';
import { quickAction, clearQueueAction } from '../actions';
import type { ActionResult } from '../action-types';
import { ConfirmButton } from './ConfirmButton';
import { useOverlayStatus } from './OverlayStatusContext';

export interface QuickCard { number: number; name: string; stars: number }

const inputClass =
  'bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition-colors';
const secondaryBtn =
  'px-3.5 py-2 text-sm font-bold bg-gray-800 hover:bg-gray-700 text-gray-100 rounded-xl transition-colors disabled:opacity-50 disabled:pointer-events-none';

function Result({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p
      role="status"
      className={`text-sm rounded-lg px-3 py-2 border ${
        state.ok
          ? 'text-green-300 bg-green-500/10 border-green-400/30'
          : 'text-amber-200 bg-amber-500/10 border-amber-400/30'
      }`}
    >
      {state.ok ? '✓ ' : '⚠ '}{state.message}
    </p>
  );
}

/**
 * Stream controls for the dashboard: gift packs, show a collection on stream, grant a card, and
 * clear the overlay queue. The three viewer-targeted actions share one form and username field;
 * the clicked button's `intent` picks which action runs. Results are shown inline.
 */
export function QuickActions({
  usernames,
  cards,
  defaultUsername = '',
}: {
  usernames: string[];
  cards: QuickCard[];
  defaultUsername?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(quickAction, null);
  const [clearState, clearAction, clearing] = useActionState<ActionResult | null, FormData>(clearQueueAction, null);
  const { status } = useOverlayStatus();

  // Controlled so the values survive a submit — React resets uncontrolled fields after a form action,
  // which would make you retype the viewer (e.g. when retrying with "queue anyway").
  const [username, setUsername] = useState(defaultUsername);
  const [count, setCount] = useState('1');
  const [cardNumber, setCardNumber] = useState('');

  // After a successful action, return the pack count / card pick to their defaults (the browser resets
  // them on submit; keep React in step). The viewer is kept so you can fire several actions in a row.
  useEffect(() => {
    if (state?.ok) { setCount('1'); setCardNumber(''); }
  }, [state]);

  const offline = status !== null && status.connected === 0;
  // A "no overlay connected" refusal is out of date as soon as an overlay connects — don't keep showing it.
  const refusalIsStale = !!state?.needsForce && !offline;
  const shown = refusalIsStale ? null : state;
  const queued = status?.queued ?? 0;
  const connected = status?.connected ?? 0;

  return (
    <section id="quick-actions" className="tcg-panel rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-white flex items-center gap-2"><span aria-hidden>⚡</span>Quick actions</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${status === null ? 'border-gray-700 text-gray-500' : offline ? 'border-amber-400/30 bg-amber-500/10 text-amber-200' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status === null ? 'bg-gray-600' : offline ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
            {status === null ? 'Checking overlay…' : offline ? 'No overlay connected' : connected === 1 ? 'Overlay connected' : `${connected} overlays connected`}
          </span>
          <span className={`rounded-full border px-2.5 py-1 font-semibold tabular-nums ${queued > 0 ? 'border-amber-400/30 bg-amber-500/10 text-amber-200' : 'border-gray-700 text-gray-400'}`}>
            {status ? `${queued} in queue` : 'queue …'}
          </span>
        </div>
      </div>

      <form action={formAction} className="p-5 space-y-5">
        {/* Who */}
        <label className="block">
          <span className="block text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5">Viewer</span>
          <div className="relative max-w-md">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 select-none" aria-hidden>@</span>
            <input
              name="username"
              list="quick-usernames"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="twitch_username"
              autoComplete="off"
              required
              className={`${inputClass} w-full pl-8`}
            />
          </div>
          <datalist id="quick-usernames">
            {usernames.map(u => <option key={u} value={u} />)}
          </datalist>
        </label>

        {/* What */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Gift packs */}
          <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-4 flex flex-col gap-3 hover:border-yellow-500/30 transition-colors">
            <div>
              <p className="font-semibold text-white flex items-center gap-2"><span aria-hidden>🎁</span>Gift packs</p>
              <p className="text-xs text-gray-500 mt-0.5">Opens packs for them on stream.</p>
            </div>
            <input type="hidden" name="count" value={count} />
            <div role="group" aria-label="Number of packs" className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 5, 10].map(n => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={count === String(n)}
                  onClick={() => setCount(String(n))}
                  className={`min-w-9 px-2.5 py-1.5 rounded-lg text-sm font-bold border transition-all ${count === String(n) ? 'border-yellow-500 bg-yellow-500/15 text-yellow-300 scale-105' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <PendingButton type="submit" name="intent" value="gift" pendingLabel="Gifting…" disabled={pending} className="mt-auto px-4 py-2.5 tcg-btn rounded-xl text-sm">
              🎁 Gift {count} pack{count !== '1' ? 's' : ''}
            </PendingButton>
          </div>

          {/* Show collection */}
          <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-4 flex flex-col gap-3 hover:border-sky-400/30 transition-colors">
            <div>
              <p className="font-semibold text-white flex items-center gap-2"><span aria-hidden>📖</span>Show collection</p>
              <p className="text-xs text-gray-500 mt-0.5">Puts their whole collection on the overlay.</p>
            </div>
            <div className="flex-1" />
            <PendingButton type="submit" name="intent" value="show" pendingLabel="Showing…" disabled={pending} className={`${secondaryBtn} py-2.5`}>
              📖 Show on stream
            </PendingButton>
          </div>

          {/* Grant a specific card */}
          <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-4 flex flex-col gap-3 hover:border-purple-400/30 transition-colors">
            <div>
              <p className="font-semibold text-white flex items-center gap-2"><span aria-hidden>🃏</span>Grant a card</p>
              <p className="text-xs text-gray-500 mt-0.5">Adds one copy straight to their collection.</p>
            </div>
            <select name="cardNumber" value={cardNumber} onChange={e => setCardNumber(e.target.value)} aria-label="Card to grant" className={`${inputClass} w-full`}>
              <option value="" disabled>Choose a card…</option>
              {cards.map(c => (
                <option key={c.number} value={c.number}>#{c.number} {c.name} {'★'.repeat(c.stars)}</option>
              ))}
            </select>
            <PendingButton type="submit" name="intent" value="grant" pendingLabel="Granting…" disabled={pending} className={`${secondaryBtn} mt-auto py-2.5`}>
              🃏 Grant card
            </PendingButton>
          </div>
        </div>

        {shown?.needsForce && (
          <label className="flex items-center gap-2 text-sm text-amber-200 cursor-pointer select-none rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
            <input type="checkbox" name="force" className="accent-yellow-500" />
            Queue anyway (it will play the next time an overlay connects)
          </label>
        )}

        {offline && !shown && (
          <p className="text-xs text-gray-500">
            No overlay is connected right now, so gifts and “show collection” won&apos;t play until you open one in OBS.
          </p>
        )}

        <Result state={shown} />
      </form>

      {/* Overlay queue */}
      <form action={clearAction} className="px-5 py-3 border-t border-gray-800 bg-gray-950/30 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-400">
          Waiting for the overlay: <span className={`font-bold tabular-nums ${queued > 0 ? 'text-amber-300' : 'text-gray-300'}`}>{status ? queued : '…'}</span>
          <span className="text-gray-600"> · draws and collection views</span>
        </p>
        <div className="flex items-center gap-3">
          {clearState && <span className="text-xs text-green-300">✓ {clearState.message}</span>}
          <ConfirmButton
            title="Clear the overlay queue?"
            confirmLabel="Clear queue"
            message={<>Discard everything waiting for the overlay{queued > 0 ? <> (<strong className="text-white">{queued}</strong> event{queued !== 1 ? 's' : ''})</> : null}? Gifted packs in the queue will never play.</>}
            className={`${secondaryBtn} ${clearing || queued === 0 ? 'opacity-50' : ''}`}
          >
            Clear queue
          </ConfirmButton>
        </div>
      </form>
    </section>
  );
}
