'use client';
import { useActionState, useState } from 'react';
import { PendingButton } from '@/app/components/PendingButton';
import type { ActionResult } from '../action-types';
import { Panel, fieldClass } from '../components/ui';
import { GOAL_LABEL_DEFAULT, GOAL_LABEL_MAX, GOAL_TARGET_MAX } from '@/lib/pack-goal-core';
import { clearPackGoalAction, setPackGoalAction } from './pack-goal-actions';

export interface PackGoalView { label: string; target: number; count: number; reward: string; by: string }

/** Mix It Up → Paid pulls: set, watch and clear the community pack goal (ROADMAP 57.5). Its own forms, apart from the settings form. */
export function PackGoalBox({ running, buffs }: { running: PackGoalView | null; buffs: { id: string; name: string }[] }) {
  const [reward, setReward] = useState<'none' | 'buff' | 'pulls'>('none');
  const [set, setAction] = useActionState<ActionResult | null, FormData>(setPackGoalAction, null);
  const [cleared, clearAction] = useActionState<ActionResult | null, FormData>(() => clearPackGoalAction(), null);
  const shown = [set, cleared].find(r => r);
  return (
    <Panel title="Community pack goal" icon="trophy" hint="A target of packs for this stream. Every real pull counts from the moment the goal is set (test pulls never do). When it is reached, chat gets one line and the reward is given once. It ends with the stream; setting a new goal starts again from 0. Show it in OBS as a text source (TCG Bridge, Live stats) or as a Pack goal layer in the Overlay Editor.">
      {running
        ? <p role="status" className="text-sm text-green-300">{running.label}: {Math.min(running.count, running.target)} / {running.target} packs. Reward: {running.reward}. Set by {running.by}.</p>
        : <p className="text-sm text-gray-400">No pack goal is set for this stream.</p>}
      <form action={setAction} className="flex flex-wrap items-end gap-4">
        <fieldset className="fieldset">
          <legend className="fieldset-legend"><label htmlFor="pg-target">Packs</label></legend>
          <input id="pg-target" name="target" type="number" min={1} max={GOAL_TARGET_MAX} step={1} defaultValue={50} required className={`${fieldClass} w-28`} />
        </fieldset>
        <fieldset className="fieldset">
          <legend className="fieldset-legend"><label htmlFor="pg-label">Label</label></legend>
          <input id="pg-label" name="label" type="text" maxLength={GOAL_LABEL_MAX} placeholder={GOAL_LABEL_DEFAULT} className={`${fieldClass} w-56`} />
        </fieldset>
        <fieldset className="fieldset">
          <legend className="fieldset-legend"><label htmlFor="pg-reward">Reward</label></legend>
          <select id="pg-reward" name="reward" value={reward} onChange={e => setReward(e.target.value as 'none' | 'buff' | 'pulls')} className={fieldClass}>
            <option value="none">None</option>
            <option value="buff" disabled={buffs.length === 0}>Community buff</option>
            <option value="pulls">Extra pulls this stream</option>
          </select>
        </fieldset>
        {reward === 'buff' && (
          <fieldset className="fieldset">
            <legend className="fieldset-legend"><label htmlFor="pg-buff">Buff</label></legend>
            <select id="pg-buff" name="buffId" className={fieldClass}>{buffs.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </fieldset>
        )}
        {reward === 'pulls' && (
          <fieldset className="fieldset">
            <legend className="fieldset-legend"><label htmlFor="pg-amount">Extra pulls each</label></legend>
            <input id="pg-amount" name="amount" type="number" min={1} max={1000} step={1} defaultValue={1} required className={`${fieldClass} w-28`} />
          </fieldset>
        )}
        <PendingButton pendingLabel="Saving..." className="btn btn-primary btn-sm">{running ? 'Replace goal' : 'Set goal'}</PendingButton>
      </form>
      {running && (
        <form action={clearAction}>
          <PendingButton pendingLabel="Clearing..." className="btn btn-sm btn-outline">Clear goal</PendingButton>
        </form>
      )}
      {buffs.length === 0 && <p className="text-xs text-gray-500">No community buff exists yet. Make one in the Buff Editor (scope: community) to offer it as a reward.</p>}
      {shown && <p role="status" className={`text-sm ${shown.ok ? 'text-green-300' : 'text-amber-200'}`}>{shown.message}</p>}
    </Panel>
  );
}
