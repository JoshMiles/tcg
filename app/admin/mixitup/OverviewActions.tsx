'use client';
import { useActionState } from 'react';
import { Icon, type IconName } from '@/app/components/Icon';
import { PendingButton } from '@/app/components/PendingButton';
import type { ActionResult } from '../action-types';
import { fieldClass } from '../components/ui';
import { ObsRefresh } from '../settings/ObsRefresh';
import { sendTestMessageAction, setPausedAction, setStreamExtraAction, testBalanceAction } from './overview-actions';

const btn = 'btn btn-sm btn-outline';

function Result({ state }: { state: ActionResult | null }) {
  return state ? <p role="status" className={`text-sm ${state.ok ? 'text-green-300' : 'text-amber-200'}`}>{state.message}</p> : null;
}

/** One button that runs an action and shows its answer under it. */
export function Quick({ title, text, icon, label, pendingLabel, run }: { title: string; text: string; icon: IconName; label: string; pendingLabel: string; run: () => Promise<ActionResult> }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(() => run(), null);
  return (
    <form action={action} className="space-y-2">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-gray-500">{text}</p>
      <PendingButton pendingLabel={pendingLabel} className={btn}><Icon name={icon} />{label}</PendingButton>
      <Result state={state} />
    </form>
  );
}

/** The Overview's quick actions. Each shows its answer inline, so nothing leaves the page. */
export function OverviewActions({ obsPaired, streamExtra, paused, pauseChat, login }: { obsPaired: boolean; streamExtra: number; paused: boolean; pauseChat: boolean; login: string }) {
  const [extra, setExtra] = useActionState(setStreamExtraAction, null);
  const [pause, setPause] = useActionState(setPausedAction, null);
  return (
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      <Quick title="Test a balance check" text={`Asks Mix It Up for ${login}'s balance. Nothing is charged.`} icon="coins" label="Check my balance" pendingLabel="Asking…" run={testBalanceAction} />
      <Quick title="Send a test chat message" text="Sends the payment message with a made-up viewer and an amount of 0." icon="send" label="Send test message" pendingLabel="Sending…" run={sendTestMessageAction} />
      {obsPaired && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-white">Refresh the overlay in OBS</p>
          <p className="text-xs text-gray-500">TCG Bridge reloads the overlay browser source.</p>
          <ObsRefresh />
        </div>
      )}
      <form action={setPause} className="space-y-2">
        <p className="text-sm font-semibold text-white">Pause pulls</p>
        <p className="text-xs text-gray-500">{paused ? <><strong className="text-amber-200">Paused now.</strong> A paid pull or !pack answers &quot;Packs are paused, back soon&quot; and nothing is charged.</> : 'Open. Pause to turn away new pulls without switching Mix It Up off. Pulls already waiting still play.'}</p>
        <label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" name="chat" defaultChecked={pauseChat} className="checkbox checkbox-xs" />Say it in chat when this changes (needs TCG Bridge)</label>
        <PendingButton name="intent" value={paused ? 'resume' : 'pause'} className={btn}><Icon name={paused ? 'play' : 'pause'} />{paused ? 'Resume pulls' : 'Pause pulls'}</PendingButton>
        <Result state={pause} />
      </form>
      <form action={setExtra}className="space-y-2">
        <p className="text-sm font-semibold text-white">Extra pulls this stream</p>
        <p className="text-xs text-gray-500">{streamExtra > 0 ? <>On now: <strong className="text-white">+{streamExtra}</strong> for everyone.</> : 'None for this stream.'} Adds pulls for every viewer on top of their limit until the stream ends. A limit of 0 stays unlimited.</p>
        <div className="flex items-end gap-2">
          <fieldset className="fieldset">
            <legend className="fieldset-legend"><label htmlFor="mx-stream">Extra pulls</label></legend>
            <input key={streamExtra} id="mx-stream" name="amount" type="number" min={0} step={1} defaultValue={streamExtra} className={`${fieldClass} w-28`} />
          </fieldset>
          <PendingButton name="intent" value="set" className={btn}>Set</PendingButton>
          <PendingButton name="intent" value="clear" className={btn}>Clear</PendingButton>
        </div>
        <Result state={extra} />
      </form>
    </div>
  );
}
