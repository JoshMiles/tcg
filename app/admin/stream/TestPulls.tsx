'use client';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { PendingButton } from '@/app/components/PendingButton';
import type { RecentTestRow } from '@/lib/mixitup-test';
import { TEST_STEPS, traceSettled, traceSummary, type TestPullState, type TestStep } from '@/lib/mixitup-test-core';
import type { ActionResult } from '../action-types';
import { fieldClass } from '../components/ui';
import { readTestTraceAction, simulatePullAction, undoTestPullAction } from './test-pull-actions';

const btn = 'btn btn-sm btn-outline';
const SUMMARY_TEXT = { running: 'text-gray-300', ok: 'text-green-300', failed: 'text-amber-200' } as const;

/** One test pull's steps, polled every second until it is saved and 10 seconds have passed, a step fails, or a minute is up. */
function Steps({ id, startedAt }: { id: string; startedAt: number }) {
  const router = useRouter();
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [now, setNow] = useState(startedAt);
  const settled = traceSettled(steps, startedAt, now);
  useEffect(() => {
    if (settled) { router.refresh(); return; }
    const t = setInterval(async () => { setSteps(await readTestTraceAction(id).catch(() => [])); setNow(Date.now()); }, 1000);
    return () => clearInterval(t);
  }, [id, settled, router]);
  const sum = traceSummary(steps, startedAt, now);
  return (
    <div className="space-y-2" aria-live="polite">
      <p className={`text-sm font-semibold ${SUMMARY_TEXT[sum.tone]}`}>{sum.text}</p>
      <ol className="space-y-1 text-sm">
        {TEST_STEPS.map(t => {
          const s = steps.find(x => x.step === t.id);
          const icon = !s ? 'hourglass' : s.state === 'ok' ? 'checkCircle' : s.state === 'failed' ? 'alert' : 'ban';
          const tone = !s ? 'text-gray-600' : s.state === 'ok' ? 'text-green-300' : s.state === 'failed' ? 'text-red-300' : 'text-gray-400';
          return (
            <li key={t.id} className={`flex flex-wrap items-baseline gap-x-2 ${tone}`}>
              <Icon name={icon} className="shrink-0 self-center" />
              <span className="font-semibold">{t.label}</span>
              {s && <span className="text-xs wrap-break-word min-w-0">{s.state === 'skipped' ? `Skipped: ${s.detail}` : s.detail}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function UndoButton({ id, label = 'Undo test pull' }: { id: string; label?: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(() => undoTestPullAction(id), null);
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <PendingButton pendingLabel="Undoing…" className={btn}><Icon name="undo" />{label}</PendingButton>
      {state && <span role="status" className={`text-xs ${state.ok ? 'text-green-300' : 'text-amber-200'}`}>{state.message}</span>}
    </form>
  );
}

const STATE_BADGE = { running: 'badge-info', ok: 'badge-success', failed: 'badge-error', expired: 'badge-ghost' } as const;
const STATE_TEXT = { running: 'Running', ok: 'Went through', failed: 'Broke', expired: 'Expired' } as const;

/** Mix It Up → Overview: simulate a chat pull as a test viewer, watch each step, and undo it. */
export function TestPulls({ viewers, paidOn, sandbox, recent }: { viewers: string[]; paidOn: boolean; sandbox: boolean; recent: RecentTestRow[] }) {
  const [state, action] = useActionState<TestPullState | null, FormData>(simulatePullAction, null);
  const [mode, setMode] = useState<'paid' | 'free'>(paidOn && !sandbox ? 'paid' : 'free');
  const paidBlocked = sandbox || !paidOn;
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <fieldset className="fieldset">
            <legend className="fieldset-legend"><label htmlFor="tp-viewer">Test viewer</label></legend>
            <select id="tp-viewer" name="username" className={`${fieldClass} w-48`} disabled={viewers.length === 0}>
              {viewers.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </fieldset>
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Pull</legend>
            <div className="flex gap-4 py-2 text-sm text-gray-200">
              <label className="flex items-center gap-1.5"><input type="radio" name="mode" value="paid" className="radio radio-xs" checked={mode === 'paid'} onChange={() => setMode('paid')} />Paid</label>
              <label className="flex items-center gap-1.5"><input type="radio" name="mode" value="free" className="radio radio-xs" checked={mode === 'free'} onChange={() => setMode('free')} />Free</label>
            </div>
          </fieldset>
          <PendingButton pendingLabel="Simulating…" disabled={viewers.length === 0} className="btn btn-sm btn-primary"><Icon name="flask" />Simulate a chat pull</PendingButton>
        </div>
        {state?.needsForce && (
          <label className="flex items-center gap-2 text-sm text-amber-200">
            <input type="checkbox" name="force" className="checkbox checkbox-xs" />Queue it anyway, to play when an overlay connects
          </label>
        )}
        {paidBlocked && <p className="text-xs text-gray-500">{sandbox ? 'A sandbox never calls TCG Bridge, so paid tests need production. Free pulls work here.' : 'Paid pulls are switched off, so a paid test would charge nothing. Switch them on in Paid pulls to try one.'}</p>}
        {state && !state.ok && <p role="status" className="text-sm text-amber-200">{state.message}</p>}
      </form>

      {state?.ok && state.id && state.startedAt && (
        <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-950/50 p-4">
          <p className="text-xs text-gray-500">{state.message}</p>
          <Steps key={state.id} id={state.id} startedAt={state.startedAt} />
          <UndoButton id={state.id} />
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold text-white">Last test pulls</p>
        {recent.length === 0 ? <p className="text-xs text-gray-500">None yet.</p> : (
          <ul className="divide-y divide-gray-800/60 rounded-lg border border-gray-800 overflow-hidden">
            {recent.map(r => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                <span className="text-gray-200">{r.username}</span>
                <span className="text-xs text-gray-500">{r.paid ? 'paid' : 'free'}</span>
                <span className={`badge badge-sm ${STATE_BADGE[r.state]}`}>{STATE_TEXT[r.state]}</span>
                {r.cardName && <span className="min-w-0 truncate text-xs text-gray-400">{r.cardName}{r.undone ? ' (undone)' : ''}</span>}
                <span className="ml-auto">{r.saved && !r.undone && <UndoButton id={r.id} label="Undo" />}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
