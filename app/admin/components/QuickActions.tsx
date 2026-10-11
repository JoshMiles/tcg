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

  return (
    <section id="quick-actions" className="tcg-panel rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-white">Quick actions</h2>
        <p className="text-xs text-gray-500">Gifts and stream controls play through the OBS overlay</p>
      </div>

      <form action={formAction} className="p-5 space-y-4">
        <label className="block">
          <span className="block text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5">Viewer</span>
          <input
            name="username"
            list="quick-usernames"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="twitch_username"
            autoComplete="off"
            required
            className={`${inputClass} w-full max-w-sm`}
          />
          <datalist id="quick-usernames">
            {usernames.map(u => <option key={u} value={u} />)}
          </datalist>
        </label>

        <div className="flex flex-wrap items-end gap-3">
          {/* Gift packs */}
          <div className="flex items-center gap-2">
            <PendingButton type="submit" name="intent" value="gift" disabled={pending} className="px-4 py-2 tcg-btn rounded-xl text-sm">
              🎁 Gift
            </PendingButton>
            <select name="count" value={count} onChange={e => setCount(e.target.value)} aria-label="Number of packs" className={`${inputClass} py-2 pr-7`}>
              {[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n} pack{n !== 1 ? 's' : ''}</option>)}
            </select>
          </div>

          {/* Show collection */}
          <PendingButton type="submit" name="intent" value="show" disabled={pending} className={secondaryBtn}>
            📖 Show collection
          </PendingButton>

          {/* Grant a specific card */}
          <div className="flex items-center gap-2">
            <select name="cardNumber" value={cardNumber} onChange={e => setCardNumber(e.target.value)} aria-label="Card to grant" className={`${inputClass} max-w-[14rem]`}>
              <option value="" disabled>Choose a card…</option>
              {cards.map(c => (
                <option key={c.number} value={c.number}>#{c.number} {c.name} {'★'.repeat(c.stars)}</option>
              ))}
            </select>
            <PendingButton type="submit" name="intent" value="grant" disabled={pending} className={secondaryBtn}>
              🃏 Grant card
            </PendingButton>
          </div>
        </div>

        {shown?.needsForce && (
          <label className="flex items-center gap-2 text-sm text-amber-200 cursor-pointer select-none">
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
      <form action={clearAction} className="px-5 py-3 border-t border-gray-800 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-400">
          Overlay queue:{' '}
          <span className={`font-bold tabular-nums ${queued > 0 ? 'text-amber-300' : 'text-gray-300'}`}>
            {status ? `${queued} waiting` : '…'}
          </span>
          <span className="text-gray-600"> · draws and collection views waiting for the overlay</span>
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
