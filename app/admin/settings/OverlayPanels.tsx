'use client';
import { useActionState, useState, useTransition } from 'react';
import { UserInput } from '@/app/components/UserInput';
import { Icon } from '@/app/components/Icon';
import type { ActionResult } from '../action-types';
import { quickAction } from '../actions/users';
import { setLiveGateAction } from '../dashboard/actions';
import { useOverlayStatus } from '../components/OverlayStatusContext';
import { PendingButton } from '../components/PendingButton';
import { Toggle } from '../components/Toggle';

/** The two "only when live" switches. Each saves the moment it is flipped (like the dashboard's), with a visible confirmation. */
export function LiveGates({ packsOnly, collectionsOnly }: { packsOnly: boolean; collectionsOnly: boolean }) {
  const [packs, setPacks] = useState(packsOnly);
  const [colls, setColls] = useState(collectionsOnly);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const flip = (kind: 'packs' | 'collections', v: boolean) => {
    const prev = kind === 'packs' ? packs : colls;
    (kind === 'packs' ? setPacks : setColls)(v);
    setNote(null);
    start(async () => {
      try { await setLiveGateAction(kind, v); setNote('Saved.'); }
      catch { (kind === 'packs' ? setPacks : setColls)(prev); setNote('Could not save. Try again.'); }
    });
  };

  return (
    <div className="space-y-4">
      <Toggle checked={packs} onChange={v => flip('packs', v)} label="Ignore pack openings while offline" hint="Pack triggers from your bot or channel points are dropped (not queued) unless you are live." />
      <Toggle checked={colls} onChange={v => flip('collections', v)} label="Ignore collection displays while offline" hint={'"Show collection" triggers are dropped unless you are live.'} />
      <p className="text-xs text-gray-500 leading-relaxed">
        Offline means no overlay is open, or OBS says it isn&apos;t streaming. That needs the browser source&apos;s <em className="text-gray-300">“Read access to OBS status information”</em> permission;
        without it the overlay can&apos;t tell, so triggers are allowed whenever it&apos;s open. Quick actions on the dashboard always work.
      </p>
      <p className={`text-xs h-4 ${note === 'Saved.' ? 'text-green-300' : 'text-red-300'}`} role="status">{pending ? 'Saving…' : note}</p>
    </div>
  );
}

/** Sends a "show collection" to the overlay as a connection test. Shows on stream if the overlay is live, so it says so. */
export function OverlayTest() {
  const { status } = useOverlayStatus();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(quickAction, null);
  const [force, setForce] = useState(false);
  const live = status?.streaming === true;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="intent" value="show" />
      {force && <input type="hidden" name="force" value="on" />}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-500 space-y-1">Viewer to show
          <UserInput name="username" required placeholder="a viewer's username" wrapperClassName="relative block" className="input w-56 block" />
        </label>
        <PendingButton pendingLabel="Sending…" disabled={pending} className="px-4 py-2 text-sm font-bold rounded-xl border border-gray-700 text-gray-100 hover:border-gray-500">
          <Icon name="send" className="mr-1.5" />Send a test to the overlay
        </PendingButton>
      </div>
      <p className={`text-xs ${live ? 'text-amber-300' : 'text-gray-500'}`}>{live ? 'You are live: this will appear on stream.' : 'Plays that viewer\'s collection on the overlay, so you can check it is connected.'}</p>
      {state && (
        <div role="status" className={`text-sm ${state.ok ? 'text-green-300' : 'text-amber-200'}`}>
          {state.message}
          {state.needsForce && <button type="button" onClick={e => { setForce(true); (e.currentTarget.form as HTMLFormElement).requestSubmit(); }} className="ml-2 underline">Queue it anyway</button>}
        </div>
      )}
    </form>
  );
}

/** A code block with a copy button. */
export function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-xl bg-gray-950/80 border border-gray-800">
      {label && <p className="px-4 pt-3 text-[10px] uppercase tracking-wider font-bold text-gray-500">{label}</p>}
      <pre className="px-4 py-3 text-xs text-green-300 overflow-x-auto leading-relaxed">{code}</pre>
      <button onClick={() => navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })} className="absolute top-2 right-2 px-2.5 py-1 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">
        {copied ? <><Icon name="check" className="mr-1" />Copied</> : <><Icon name="copy" className="mr-1" />Copy</>}
      </button>
    </div>
  );
}
