'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArmedButton } from '@/app/components/ArmedButton';
import { clearQueueAction } from '../actions/users';
import { liftPullBlockAction } from './bridge-actions';

export interface BlockRow { username: string; by: string; scope: string }
export interface QueueView { id: string; kind: string; username: string; pack: string; waited: string }

const secondary = 'btn btn-sm btn-outline';

/** Live → Blocked from pulls: who is turned away, with Lift (moved here from the Bridge card). */
export function BlockedList({ blocks }: { blocks: BlockRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (blocks.length === 0) return <p className="text-sm text-gray-500">Nobody is blocked from pulls.</p>;
  return (
    <ul className="divide-y divide-gray-800 text-sm">
      {blocks.map(b => (
        <li key={b.username} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="text-gray-200">{b.username}<span className="block text-xs text-gray-500">{b.scope}, by {b.by}</span></span>
          <button type="button" disabled={pending} className={secondary} onClick={() => start(async () => { await liftPullBlockAction(b.username); router.refresh(); })}>Lift</button>
        </li>
      ))}
    </ul>
  );
}

/** Live → Queue: who is waiting for the overlay, next first, with the admin's Clear queue (refunds every waiting pull). */
export function QueueList({ queue }: { queue: QueueView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  return (
    <div className="space-y-3">
      {queue.length === 0 ? <p className="text-sm text-gray-500">Nothing is waiting.</p> : (
        <ul className="divide-y divide-gray-800 text-sm" aria-label="Waiting events">
          {queue.map((q, i) => (
            <li key={q.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{i === 0 ? 'Next' : i + 1}</span>
              <span className="font-semibold text-white">{q.username}</span>
              <span className="text-gray-400">{q.kind === 'pull' ? 'pull' : 'show-off'}{q.pack && `, ${q.pack}`}</span>
              <span className="ml-auto text-xs text-gray-500">{q.waited}</span>
            </li>
          ))}
        </ul>
      )}
      {queue.length > 0 && (
        <ArmedButton
          onConfirm={() => start(async () => { setMsg((await clearQueueAction()).message); router.refresh(); })}
          className={secondary} armedClassName="btn btn-sm btn-error"
        >{pending ? 'Clearing…' : 'Clear queue'}</ArmedButton>
      )}
      {msg && <p role="status" className="text-sm text-green-300">{msg}</p>}
    </div>
  );
}
